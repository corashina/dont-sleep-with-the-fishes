import { MAX_EVENT_BYTES, parseEvent } from '../../src/analytics/eventContract';

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const length = Number(request.headers.get('content-length') ?? '0');
  if (length > MAX_EVENT_BYTES) return new Response(null, { status: 400 });
  const event = parseEvent(await request.text());
  if (event === null) return new Response(null, { status: 400 });
  const country = typeof request.cf?.country === 'string' ? request.cf.country : 'XX';
  env.EVENTS.writeDataPoint({
    indexes: [event.event],
    blobs: [event.event, country, event.event === 'game_end' ? event.ending : ''],
    doubles: [event.event === 'game_end' ? event.day : 0],
  });
  return new Response(null, { status: 204 });
};
