/**
 * 深空背景：双星云长周期漂移 + 静态星点 + 噪点。
 * 所有层不透明度恒定，仅以 transform 流动，避免任何呼吸/闪烁。
 */
export function Backdrop() {
  return (
    <div className="sr-backdrop" aria-hidden="true">
      <div className="sr-backdrop__nebula sr-backdrop__nebula--a" />
      <div className="sr-backdrop__nebula sr-backdrop__nebula--b" />
      <div className="sr-backdrop__stars" />
      <div className="sr-backdrop__grain" />
    </div>
  );
}
