import type { Event } from './event';

export class IndexData {
  tag?: string;

  constructor(
    public data?: any,
    public deps: string[] = [],
    public events: Event[] = [],
    // public owner?: string,
  ) {}

  toJSON() {
    return this.data;
  }
}
