/** Shimmering stand-in that mirrors the real dashboard layout while data loads. */
export default function DashboardSkeleton() {
    return (
        <div className="dash" aria-busy="true" aria-live="polite">
            <span className="tp-eyebrow">Loading dashboard…</span>

            <section className="dash-hero">
                <div className="dash-hero-left">
                    <div className="skeleton skeleton-line" style={{ width: '38%' }} />
                    <div className="skeleton skeleton-line" style={{ width: '24%' }} />
                    <div className="skeleton skeleton-hero" />
                    <div className="skeleton skeleton-line" style={{ width: '62%' }} />
                </div>
            </section>

            <div className="dash-rail">
                {[0, 1, 2, 3, 4].map(i => (
                    <div key={i} className="dash-rail-card">
                        <div className="skeleton skeleton-line" style={{ width: '70%' }} />
                        <div className="skeleton" style={{ height: 30, width: '50%' }} />
                    </div>
                ))}
            </div>

            <div className="dash-grid">
                <div className="dash-tile dash-col-7">
                    <div className="skeleton skeleton-line" style={{ width: '40%' }} />
                    <div className="skeleton skeleton-block" />
                </div>
                <div className="dash-tile dash-col-5">
                    <div className="skeleton skeleton-line" style={{ width: '45%' }} />
                    <div className="skeleton skeleton-block" />
                </div>
            </div>
        </div>
    )
}
