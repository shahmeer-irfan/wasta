// ============================================================
// Generic binary min-heap priority queue.
// Used by A* as the OPEN set: pop the node with lowest f-score in O(log n).
// ============================================================

export class MinHeap<T> {
  // Internal array layout (1-indexed math, 0-indexed storage):
  //   parent(i) = (i - 1) >> 1
  //   left(i)   = 2*i + 1
  //   right(i)  = 2*i + 2
  private heap: Array<{ item: T; key: number }> = [];

  size(): number { return this.heap.length; }
  isEmpty(): boolean { return this.heap.length === 0; }

  /** O(log n). Inserts item with priority `key` (lower = higher priority). */
  push(item: T, key: number): void {
    this.heap.push({ item, key });
    this.bubbleUp(this.heap.length - 1);
  }

  /** O(log n). Removes and returns the lowest-key item. Returns null if empty. */
  pop(): T | null {
    if (this.heap.length === 0) return null;
    const top = this.heap[0].item;
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return top;
  }

  /** O(1). Peek lowest-key item without removing. */
  peek(): T | null {
    return this.heap.length > 0 ? this.heap[0].item : null;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.heap[parent].key <= this.heap[i].key) break;
      [this.heap[parent], this.heap[i]] = [this.heap[i], this.heap[parent]];
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    const n = this.heap.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1;
      const r = 2 * i + 2;
      if (l < n && this.heap[l].key < this.heap[smallest].key) smallest = l;
      if (r < n && this.heap[r].key < this.heap[smallest].key) smallest = r;
      if (smallest === i) break;
      [this.heap[smallest], this.heap[i]] = [this.heap[i], this.heap[smallest]];
      i = smallest;
    }
  }
}
