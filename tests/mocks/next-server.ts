export const after = (fn: () => unknown) => {
  try {
    fn();
  } catch {}
};

export class NextResponse extends Response {
  static json(data: unknown, init?: ResponseInit) {
    return Response.json(data, init);
  }
}
