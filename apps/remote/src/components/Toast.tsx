export function Toast({ message }: { message: string }) {
  return message ? (
    <div class="toast" role="status">
      {message}
    </div>
  ) : null;
}
