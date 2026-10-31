import type { Entry } from '../../../../packages/contracts';

export const HOUR_HEIGHT = 80;
export const dayKey = (day: Date) => day.toISOString().slice(0, 10);
export const moscowDay = (key: string) => new Date(`${key}T00:00:00+03:00`).getTime();
export const lessonEnd = (entry: Entry) =>
  new Date(entry.data.start).getTime() + entry.data.duration * 60_000;

// Place simultaneous lessons side by side, including lessons spanning midnight.
export function layoutDayEvents(entries: Entry[], key: string) {
  const midnight = moscowDay(key);
  const events = entries
    .filter(
      (entry) =>
        new Date(entry.data.start).getTime() < midnight + 86_400_000 && lessonEnd(entry) > midnight,
    )
    .map((entry) => ({
      entry,
      start: Math.max(0, (new Date(entry.data.start).getTime() - midnight) / 60_000),
      end: Math.min(1440, (lessonEnd(entry) - midnight) / 60_000),
      column: 0,
      columns: 1,
    }))
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: typeof events = [];
  let laneEnds: number[] = [];
  let clusterEnd = 0;
  const finish = () =>
    cluster.forEach((event) => {
      event.columns = laneEnds.length;
    });
  for (const event of events) {
    if (event.start >= clusterEnd) {
      finish();
      cluster = [];
      laneEnds = [];
    }
    let lane = laneEnds.findIndex((end) => end <= event.start);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = event.end;
    event.column = lane;
    cluster.push(event);
    clusterEnd = Math.max(clusterEnd, event.end);
  }
  finish();
  return events;
}
