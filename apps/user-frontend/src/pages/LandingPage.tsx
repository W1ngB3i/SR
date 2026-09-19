import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import '../styles/landing.css';

/**
 * 公会落地页：审核系统之前的一道门面。
 * 讲清「SR 是谁、打过什么、怎么加入」，最后一步才把人送进 /apply。
 * 视觉上刻意与审核系统的玻璃体系分开——碳黑底、单一竞技黄、不用卡片。
 */

/** 逐项延迟，营造错峰入场 */
const delay = (s: number) => ({ '--d': `${s}s` }) as CSSProperties;

/** HashRouter 下不能用 #anchor，改为直接滚动 */
function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** 四个分部：图待实景截图补齐，未到位时渲染编号占位 */
const DIVISIONS: {
  idx: string;
  name: string;
  role: string;
  text: React.ReactNode;
  img?: string;
}[] = [
  {
    idx: '01',
    name: 'SR_Party',
    role: '起点 · Misaki',
    text: <>公会最早的班底。2021 年 Misaki 国际服那一战由它主导——下面单独讲。</>,
    img: '/media/div-party.jpg',
  },
  {
    idx: '02',
    name: 'SR_Team',
    role: '布吉岛 · Java',
    text: (
      <>
        前身是花雨庭部门，聚起花雨庭大量公会，规模堪比后来的 Rose 联会、ES。
        <em>椿枕、逗号、神迹、PWG、立法人（TDA）</em>都在这里待过。
      </>
    ),
    img: '/media/div-team.jpg',
  },
  {
    idx: '03',
    name: 'SR_Group',
    role: '联机大厅',
    text: (
      <>
        <em>岚天殿</em>在这里铸下名号，
        <em>川狱、焚天殿、MERC、白川、PAS、YFS、Lgs、茗门</em>
        相继加入。这批老公会，至今三四年。
      </>
    ),
    img: '/media/div-group.jpg',
  },
  {
    idx: '04',
    name: 'SR_Arrow',
    role: '租赁服',
    text: (
      <>
        在<em>红铁、Ltier</em>圈子里有一席之地，大规模公会战随时能拉人打。
      </>
    ),
    img: '/media/div-arrow.jpg',
  },
];

/** 数据网格：不装进卡片，数字本身就是主角 */
const STATS: { num: React.ReactNode; label: string; key?: boolean }[] = [
  { num: '2020', label: '公会起点', key: true },
  { num: <>6<small>年</small></>, label: '从起家至今' },
  { num: <>4<small>个</small></>, label: '分部' },
  { num: '9:1', label: 'Misaki 之战', key: true },
  { num: <>5<small>部</small></>, label: '宣传片' },
];

const FILMS: { year: string; title: string; cover: string; href: string }[] = [
  {
    year: '2023',
    title: '中国顶尖公会三周年 PVP 盛宴',
    cover: '/media/cover-anniv.jpg',
    href: 'https://b23.tv/IJAtIPE',
  },
  {
    year: '2024',
    title: '龙年新春宣传片',
    cover: '/media/cover-dragon.jpg',
    href: 'https://b23.tv/4mRxUav',
  },
  {
    year: '2024',
    title: '基岩版国庆节公会宣传',
    cover: '/media/cover-be1.jpg',
    href: 'https://b23.tv/BQ36L1n',
  },
  {
    year: '2024',
    title: '基岩版巅峰公会国庆节宣传',
    cover: '/media/cover-be2.jpg',
    href: 'https://b23.tv/POJwCKI',
  },
  {
    year: '2026',
    title: '2K26 宣传片：终局的准星',
    cover: '/media/cover-2k26.jpg',
    href: 'https://b23.tv/5kgVcdd',
  },
];

const STEPS = [
  {
    idx: '01',
    name: '要一个接洽码',
    text: '在群里私聊审核员，拿到一个一次性接洽码。码只用一次，用完作废。',
  },
  {
    idx: '02',
    name: '填申请单',
    text: '填圈名、选部门和模式，附上录像或截图。有自证画面更好，没有也能交。',
  },
  {
    idx: '03',
    name: '等审核与公示',
    text: '审核员接单、约战、出回执。结果在公示墙公开，凭圈名和查询码随时回看。',
  },
];

/** 分部配图：截图未到位或加载失败时退回编号占位，不留破图 */
function DivisionMedia({ idx, img }: { idx: string; img?: string }) {
  const [failed, setFailed] = useState(false);
  if (!img || failed) {
    return (
      <div className="sv-division__ph">
        <i>{idx}</i>
        <span>实景截图待补</span>
      </div>
    );
  }
  return <img src={img} alt="" loading="lazy" onError={() => setFailed(true)} />;
}

export function LandingPage() {
  const heroRef = useRef<HTMLElement>(null);
  const [stuck, setStuck] = useState(false);

  // 滚动进入视口后上移淡入（逐项延迟由 CSS 变量控制），只触发一次
  useEffect(() => {
    const items = document.querySelectorAll<HTMLElement>('.sv-landing [data-reveal]');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('is-in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.16, rootMargin: '0px 0px -6% 0px' },
    );
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  // 导航落底 + Hero 画面轻微视差（rAF 节流，仅 translate，不做循环动画）
  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        setStuck(y > 40);
        const bg = heroRef.current?.querySelector<HTMLElement>('.sv-hero__bg');
        if (bg && y < window.innerHeight * 1.2) {
          bg.style.transform = `translate3d(0, ${y * 0.16}px, 0)`;
        }
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="sv-landing">
      <nav className={`sv-nav${stuck ? ' is-stuck' : ''}`}>
        <Link to="/" className="sv-nav__brand">
          <img src="/logo.png" alt="SR" className="sv-nav__mark" />
          <span className="sv-nav__word">
            SR<em>MC PVP 公会</em>
          </span>
        </Link>
        <div className="sv-nav__links">
          <button type="button" onClick={() => scrollToId('divisions')}>
            分部
          </button>
          <button type="button" onClick={() => scrollToId('battle')}>
            那一战
          </button>
          <button type="button" onClick={() => scrollToId('films')}>
            宣传片
          </button>
          <Link to="/query">进度查询</Link>
          <Link to="/published">结果公示</Link>
        </div>
        <Link to="/apply" className="sv-btn sv-btn--sm sv-nav__cta">
          申请加入
        </Link>
      </nav>

      {/* 1 · Hero：满幅画面 + 底部公告条 */}
      <section className="sv-hero" ref={heroRef}>
        <div className="sv-hero__bg">
          {/* 主视觉用 2K26 宣传片封面（1920×1080）；以后有更好的实景截图直接换此处 */}
          <img src="/media/cover-2k26.jpg" alt="" />
        </div>
        <div className="sv-hero__veil" />
        <div className="sv-hero__inner">
          <p className="sv-hero__eyebrow" data-reveal style={delay(0.15)}>
            SR · MC PVP 公会
          </p>
          <h1 className="sv-hero__title" data-reveal style={delay(0.28)}>
            <span>在方块间打了六年。</span>
            <span>还没打完。</span>
          </h1>
          <p className="sv-hero__sub" data-reveal style={delay(0.42)}>
            <b>SR_Party、SR_Team、SR_Group、SR_Arrow</b>
            ——四个分部，从 Misaki 国际服一路打到今天。
          </p>
          <div className="sv-hero__cta" data-reveal style={delay(0.56)}>
            <Link to="/apply" className="sv-btn sv-btn--solid">
              申请加入 SR
            </Link>
            <button
              type="button"
              className="sv-btn sv-btn--ghost"
              onClick={() => scrollToId('films')}
            >
              看看宣传片
            </button>
          </div>
          <div className="sv-ticker" data-reveal style={delay(0.7)}>
            <span className="sv-ticker__text">
              2026 · 《2K26 宣传片：终局的准星》已发布
            </span>
            <button type="button" className="sv-ticker__link" onClick={() => scrollToId('films')}>
              去看看 →
            </button>
          </div>
        </div>
      </section>

      {/* 2 · 米白宣言 + 数据 */}
      <section className="sv-manifesto">
        <div className="sv-wrap">
          <h2 className="sv-manifesto__lines" data-reveal>
            <span>不只是一个公会。</span>
            <span>是 MC PvP 的一段路。</span>
          </h2>
          <p className="sv-manifesto__lede" data-reveal style={delay(0.12)}>
            2020 年，几个人在方块间约了一场架。后来人越来越多——有人留下名字，有人立下规矩，也有人把最好的几年放在了这里。圈子换了几轮，服务器开了又关，我们还在打。
          </p>
          <div className="sv-stats">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`sv-stat${s.key ? ' sv-stat--key' : ''}`}
                data-reveal
                style={delay(0.08 * i)}
              >
                <div className="sv-stat__num">{s.num}</div>
                <div className="sv-stat__label">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3 · 四个分部 */}
      <section className="sv-divisions" id="divisions">
        <div className="sv-wrap">
          <div className="sv-sec-head" data-reveal>
            <div className="sv-sec-head__eyebrow">2020 — 2026</div>
            <h2 className="sv-sec-head__title">四个分部</h2>
          </div>
          {DIVISIONS.map((d, i) => (
            <article
              key={d.name}
              className={`sv-division${i % 2 === 1 ? ' sv-division--flip' : ''}`}
              data-reveal
              style={delay(0.05 * i)}
            >
              <div className="sv-division__media">
                <DivisionMedia idx={d.idx} img={d.img} />
              </div>
              <div className="sv-division__body">
                <div className="sv-division__idx">{d.idx}</div>
                <h3 className="sv-division__name">{d.name}</h3>
                <div className="sv-division__role">{d.role}</div>
                <p className="sv-division__text">{d.text}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 4 · 那一战 */}
      <section className="sv-battle" id="battle">
        <div className="sv-battle__score" data-reveal>
          9:1
        </div>
        <div className="sv-battle__vs" data-reveal style={delay(0.14)}>
          SR · VS · 天选 &amp; 冥界联军
        </div>
        <p className="sv-battle__text" data-reveal style={delay(0.26)}>
          2021 年中，Misaki 国际服触屏公会战。SR 面对天选、冥界两军联军，最终以 9 比 1
          收场。这一战由 SR_Party 主导，也是后面所有故事的起点。
        </p>
      </section>

      {/* 5 · 宣传片 */}
      <section className="sv-films" id="films">
        <div className="sv-wrap">
          <div className="sv-sec-head sv-sec-head--ink" data-reveal>
            <div className="sv-sec-head__eyebrow">2023 — 2026</div>
            <h2 className="sv-sec-head__title">五部宣传片</h2>
          </div>
          <div className="sv-films__grid">
            {FILMS.map((f, i) => (
              <a
                key={f.href}
                className="sv-film"
                href={f.href}
                target="_blank"
                rel="noreferrer"
                data-reveal
                style={delay(0.06 * i)}
              >
                <div className="sv-film__cover">
                  <img src={f.cover} alt={`《${f.title}》封面`} loading="lazy" />
                  <span className="sv-film__play" aria-hidden="true">
                    <svg viewBox="0 0 12 14" fill="currentColor">
                      <path d="M0 0l12 7-12 7z" />
                    </svg>
                  </span>
                </div>
                <div className="sv-film__meta">
                  <span className="sv-film__year">{f.year}</span>
                  <span className="sv-film__title">{f.title}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* 6 · 加入 */}
      <section className="sv-join" id="join">
        <div className="sv-wrap">
          <div className="sv-sec-head" data-reveal>
            <div className="sv-sec-head__eyebrow">加入流程</div>
            <h2 className="sv-sec-head__title">三步进 SR</h2>
          </div>
          <div className="sv-steps">
            {STEPS.map((s, i) => (
              <div key={s.idx} className="sv-step" data-reveal style={delay(0.1 * i)}>
                <div className="sv-step__idx">{s.idx}</div>
                <h3 className="sv-step__name">{s.name}</h3>
                <p className="sv-step__text">{s.text}</p>
              </div>
            ))}
          </div>
          <div className="sv-join__cta" data-reveal style={delay(0.1)}>
            <Link to="/apply" className="sv-btn sv-btn--solid">
              开始申请
            </Link>
            <p className="sv-join__note">
              找不到接洽码？联系审核总管<b>望北</b>（QQ 2774265885）或副总管<b>雨夜</b>
              （QQ 477109615）。
            </p>
          </div>
        </div>
      </section>

      <footer className="sv-footer">
        <div className="sv-footer__inner">
          <span>© 2020—2026 SR 公会</span>
          <div className="sv-footer__links">
            <Link to="/apply">提交申请</Link>
            <Link to="/query">进度查询</Link>
            <Link to="/published">结果公示</Link>
            <Link to="/rules">审核规则</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}