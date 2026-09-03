import {
  compressGalleryImage,
  GalleryError,
  galleryErrorCode,
  uploadGalleryImage,
  validateGalleryFile,
  type GalleryErrorCode,
  type GalleryItem,
} from "./gallery.ts";

/**
 * The upload queue behind the profile gallery editor.
 *
 * WHAT THIS REPLACES, and why it is a module rather than another closure in
 * ProfileForm. The old flow was one `for` loop over the selected files inside
 * the change handler: compress, upload, next. Strictly serial, so six files
 * meant six sequential transfers with nothing overlapping; one shared status
 * line, so "Uploading 40%" told you nothing about WHICH of the six; one
 * `catch` that threw the cause away and offered no way to try again; and no
 * row on screen until a file had finished, so a slow upload looked like
 * nothing happening at all.
 *
 * Every one of those is a consequence of the work living in a loop. A queue —
 * a list of tasks each carrying its own state, its own progress and its own
 * error — is the shape that lets six files be six visible things.
 *
 * THE TWO LANES. Preparing (decode → scale → encode, now with a quality/size
 * ladder that can run several encodes for one file) is main-thread canvas
 * work: running three at once does not make it faster, it makes the page
 * stutter. Uploading is network-bound and overlaps beautifully. So preparation
 * is serialized to one at a time and uploads run up to MAX_CONCURRENT_UPLOADS
 * together, which pipelines naturally — file 2 is being encoded while files 1
 * and 3 are in flight.
 *
 * NO REPLACEMENT LANE. The branch this came from carried a per-row Crop that
 * re-uploaded an existing image, so a task could be a swap rather than an
 * addition. Cropping left the pipeline on 2026-09-02 and the editor that drove
 * it is gone, so every task here is an addition and the capacity arithmetic
 * has one case instead of two.
 */

const MAX_CONCURRENT_UPLOADS = 3;

export type GalleryTaskState = "queued" | "preparing" | "uploading" | "error";

export interface GalleryTask {
  readonly id: string;
  /** Shown so a per-file error names the file it belongs to. */
  readonly name: string;
  /**
   * An object URL for the LOCAL bytes. This is what makes the queue optimistic:
   * the thumbnail is on screen before a byte has left the browser. Revoked when
   * the task leaves the list — the queue owns it, nobody else may.
   */
  readonly thumbUrl: string;
  state: GalleryTaskState;
  /** 0-100, meaningful only while `state === "uploading"`. */
  progress: number;
  error?: GalleryErrorCode;
}

export interface AddOutcome {
  /** How many files actually entered the queue. */
  queued: number;
  /** Files turned away by validateGalleryFile, with the reason for each. */
  rejected: Array<{ name: string; code: GalleryErrorCode }>;
  /**
   * How many files were dropped for want of room.
   *
   * Reported as a count, not as a single "gallery is full", because the old
   * behaviour only mentioned the cap AFTER uploading as many as fitted and then
   * silently abandoning the rest mid-batch.
   */
  overflow: number;
}

export interface GalleryQueueOptions {
  /** The signed-in uid, read at the moment of upload — a session can end mid-queue. */
  uid: () => string | null;
  /** Free slots in the gallery: the member's current limit minus what is committed. */
  capacity: () => number;
  /** Called on every state, progress or membership change. The consumer re-renders. */
  onChange: () => void;
  /**
   * One image made it, as the array item to append. It carries its `imageId`,
   * because the record — not the URL — is what the rest of the pipeline
   * addresses an image by.
   */
  onUploaded: (item: GalleryItem) => void;
}

export interface GalleryQueue {
  add(files: File[]): AddOutcome;
  tasks(): GalleryTask[];
  /** Tasks that still intend to occupy a gallery slot (i.e. not failed ones). */
  pendingCount(): number;
  cancel(id: string): void;
  retry(id: string): void;
  dismiss(id: string): void;
}

/**
 * Which failures could plausibly succeed on a second attempt.
 *
 * Offering Retry next to "this file is not an image" is a lie the old single
 * message told by omission; the point of the taxonomy is to stop telling it.
 * `denied` is here because the honest fix — sign in again — happens in another
 * tab and then the retry works.
 */
export function isRetryable(code: GalleryErrorCode): boolean {
  return code === "network" || code === "unknown" || code === "denied";
}

/** The i18n key for a code, so both gallery surfaces name a cause the same way. */
export function galleryErrorKey(code: GalleryErrorCode): string {
  return `profile.gallery.err.${code}`;
}

/**
 * Runs at most `max` of the wrapped operations at once; the rest wait in line.
 *
 * Hand-rolled because it is nine lines and the alternative is a dependency.
 * Used twice: once with max 1 (the encoder, which must not fight itself for the
 * main thread) and once with MAX_CONCURRENT_UPLOADS.
 */
function createLimiter(max: number) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return async function run<T>(operation: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await operation();
    } finally {
      active -= 1;
      waiting.shift()?.();
    }
  };
}

export function createGalleryQueue(options: GalleryQueueOptions): GalleryQueue {
  const tasks: GalleryTask[] = [];
  /**
   * Per-task teardown, held outside the task objects so those stay plain data
   * the renderer can read without tripping over functions:
   * - `cancels` holds the live Storage transfer's cancel, present only while uploading.
   * - `abandoned` is the flag a cancel sets before the upload has started, which
   *   the runner checks at each stage so a queued or encoding task also stops.
   */
  const cancels = new Map<string, () => void>();
  const abandoned = new Set<string>();

  const prepare = createLimiter(1);
  const transfer = createLimiter(MAX_CONCURRENT_UPLOADS);

  let counter = 0;
  const nextId = () => `gq${(counter += 1)}`;

  function find(id: string) {
    return tasks.find((task) => task.id === id);
  }

  /**
   * Slots the queue is holding for images the gallery has not received yet.
   *
   * Failed tasks are excluded — they will never occupy a slot unless retried,
   * and a retried row already exists.
   */
  function pendingSlots() {
    return tasks.filter((task) => task.state !== "error").length;
  }

  function remove(id: string) {
    const index = tasks.findIndex((task) => task.id === id);
    if (index === -1) return;
    URL.revokeObjectURL(tasks[index].thumbUrl);
    tasks.splice(index, 1);
    cancels.delete(id);
    abandoned.delete(id);
  }

  function fail(task: GalleryTask, code: GalleryErrorCode) {
    task.state = "error";
    task.error = code;
    task.progress = 0;
    cancels.delete(task.id);
    options.onChange();
  }

  /** Drop a task's row and tell the consumer. The one way a task leaves quietly. */
  function discard(id: string) {
    remove(id);
    options.onChange();
  }

  async function run(task: GalleryTask, source: Blob) {
    // A cancel between queueing and reaching the front of the line: nothing has
    // been spent, so the row simply goes away.
    if (abandoned.has(task.id)) return discard(task.id);

    try {
      const compressed = await prepare(async () => {
        if (abandoned.has(task.id)) return null;
        task.state = "preparing";
        options.onChange();
        return await compressGalleryImage(source);
      });
      if (!compressed || abandoned.has(task.id)) return discard(task.id);

      const item = await transfer(async () => {
        if (abandoned.has(task.id)) return null;
        // Read the uid HERE, not when the file was picked: a queue can outlive
        // a session, and uploading into the previous member's folder is worse
        // than failing.
        const uid = options.uid();
        if (!uid) throw new GalleryError("denied");
        task.state = "uploading";
        task.progress = 0;
        options.onChange();
        return await uploadGalleryImage(uid, compressed, {
          onProgress: (pct) => {
            task.progress = pct;
            options.onChange();
          },
          onCancellable: (cancel) => cancels.set(task.id, cancel),
        });
      });
      if (!item || abandoned.has(task.id)) return discard(task.id);

      // The row's job is done the moment the image is real. Removing it here
      // rather than leaving a "done" state is what makes the handover look like
      // one row settling into the gallery instead of two rows for one image.
      remove(task.id);
      options.onUploaded(item);
      options.onChange();
    } catch (error) {
      const code = galleryErrorCode(error);
      // Cancelling produces a rejected upload promise like any other failure.
      // It is not one, so it leaves no error row behind.
      if (code === "cancelled" || abandoned.has(task.id)) return discard(task.id);
      fail(task, code);
    }
  }

  function enqueue(source: Blob, name: string): GalleryTask {
    const task: GalleryTask = {
      id: nextId(),
      name,
      thumbUrl: URL.createObjectURL(source),
      state: "queued",
      progress: 0,
    };
    tasks.push(task);
    // Started immediately and deliberately un-awaited: the limiters, not this
    // call site, decide when the work actually runs.
    void run(task, source);
    return task;
  }

  return {
    add(files) {
      const outcome: AddOutcome = { queued: 0, rejected: [], overflow: 0 };
      // Capacity is checked BEFORE anything is queued, so the cap is reported
      // once, up front, about the whole selection — rather than discovered
      // partway through a batch that has already spent the member's bandwidth.
      let room = Math.max(0, options.capacity() - pendingSlots());

      for (const file of files) {
        const rejection = validateGalleryFile(file);
        if (rejection) {
          outcome.rejected.push({ name: file.name, code: rejection });
          continue;
        }
        if (room === 0) {
          outcome.overflow += 1;
          continue;
        }
        room -= 1;
        outcome.queued += 1;
        enqueue(file, file.name);
      }
      if (outcome.queued > 0) options.onChange();
      return outcome;
    },

    tasks: () => tasks.slice(),
    pendingCount: pendingSlots,

    cancel(id) {
      const task = find(id);
      if (!task) return;
      abandoned.add(id);
      const cancel = cancels.get(id);
      // Mid-transfer: let Storage abort it and let the catch clean up, so there
      // is exactly one removal path. The images/ record is left in `uploading`,
      // which is what a tab closed mid-upload leaves too — sweepImages clears
      // record and bytes together. Not yet transferring: nothing to abort, and
      // the runner's next checkpoint would only remove it after the encoder had
      // finished with it — too slow to feel like a cancel, hence removing now.
      if (cancel) cancel();
      else discard(id);
    },

    retry(id) {
      const task = find(id);
      if (!task || task.state !== "error") return;
      task.state = "queued";
      task.error = undefined;
      task.progress = 0;
      abandoned.delete(id);
      options.onChange();
      // Re-fetching the bytes from the object URL rather than holding the File:
      // one owner for the source data, and it is already the thing on screen.
      void fetch(task.thumbUrl)
        .then((response) => response.blob())
        .then((blob) => run(task, blob))
        .catch(() => fail(task, "unknown"));
    },

    dismiss: discard,
  };
}
