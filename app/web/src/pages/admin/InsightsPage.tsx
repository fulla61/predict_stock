/** インサイト — Build Increment 2 ではプレースホルダー（CONTRACT-2 §3） */
export default function InsightsPage() {
  return (
    <section className="enter" aria-labelledby="ins-h">
      <h2 id="ins-h" className="sr-only">
        インサイト
      </h2>
      <div className="sec-title">インサイト</div>
      <div className="card insights-placeholder">
        <h3>データ蓄積後に有効化されます</h3>
        <p>
          相談・提案・条件変更のデータが集まると、よくあるご要望・つまずく点・
          条件変更の理由などの分析がここに表示されます。
        </p>
      </div>
    </section>
  );
}
