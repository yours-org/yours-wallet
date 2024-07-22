import type { Event } from './event';

export class IndexData {
  tag?: string;

  constructor(
    public data?: any,
    public deps: string[] = [],
    public events: Event[] = [],
  ) {}

  toJSON() {
    return this.data;
  }
}
