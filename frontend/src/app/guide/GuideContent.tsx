"use client";

import Link from "next/link";
import ProductInfoNav from "@/components/ProductInfoNav";
import { useI18n } from "@/components/I18nProvider";
import { PageHeader, PageShell, Surface } from "@/components/ui/Page";

const steps = [
  { id: "step-account", shortKey: "productInfo.guideStep1Short", titleKey: "productInfo.guideStep1Title", locationKey: "productInfo.guideStep1Location", checkKey: "productInfo.guideStep1Check", actionKey: "productInfo.guideStep1Action", href: "/register" },
  { id: "step-catalog", shortKey: "productInfo.guideStep2Short", titleKey: "productInfo.guideStep2Title", locationKey: "productInfo.guideStep2Location", checkKey: "productInfo.guideStep2Check", actionKey: "productInfo.guideStep2Action", href: "/assets?create=1" },
  { id: "step-candidates", shortKey: "productInfo.guideStep3Short", titleKey: "productInfo.guideStep3Title", locationKey: "productInfo.guideStep3Location", checkKey: "productInfo.guideStep3Check", actionKey: "productInfo.guideStep3Action", href: "/watchlist" },
  { id: "step-anchors", shortKey: "productInfo.guideStep4Short", titleKey: "productInfo.guideStep4Title", locationKey: "productInfo.guideStep4Location", checkKey: "productInfo.guideStep4Check", actionKey: "productInfo.guideStep4Action", href: "/watchlist" },
  { id: "step-evidence", shortKey: "productInfo.guideStep5Short", titleKey: "productInfo.guideStep5Title", locationKey: "productInfo.guideStep5Location", checkKey: "productInfo.guideStep5Check", actionKey: "productInfo.guideStep5Action", href: "/quant" },
  { id: "step-execution", shortKey: "productInfo.guideStep6Short", titleKey: "productInfo.guideStep6Title", locationKey: "productInfo.guideStep6Location", checkKey: "productInfo.guideStep6Check", actionKey: "productInfo.guideStep6Action", href: "/trade" },
  { id: "step-review", shortKey: "productInfo.guideStep7Short", titleKey: "productInfo.guideStep7Title", locationKey: "productInfo.guideStep7Location", checkKey: "productInfo.guideStep7Check", actionKey: "productInfo.guideStep7Action", href: "/decision#investment-review" },
] as const;

const areas = [
  { titleKey: "productInfo.guideOrientWorkbenchTitle", bodyKey: "productInfo.guideOrientWorkbenchBody", href: "/" },
  { titleKey: "productInfo.guideOrientInvestmentsTitle", bodyKey: "productInfo.guideOrientInvestmentsBody", href: "/portfolio" },
  { titleKey: "productInfo.guideOrientDecisionsTitle", bodyKey: "productInfo.guideOrientDecisionsBody", href: "/decision" },
  { titleKey: "productInfo.guideOrientToolsTitle", bodyKey: "productInfo.guideOrientToolsBody", href: "/tools" },
] as const;

const checklist = [
  "productInfo.guideChecklist1",
  "productInfo.guideChecklist2",
  "productInfo.guideChecklist3",
  "productInfo.guideChecklist4",
  "productInfo.guideChecklist5",
] as const;

export default function GuideContent() {
  const { t } = useI18n();

  return (
    <PageShell width="reading" className="product-info-page guide-page">
      <ProductInfoNav />
      <PageHeader eyebrow={t("productInfo.guideEyebrow")} title={t("productInfo.guideTitle")} description={t("productInfo.guideDescription")} />

      <nav className="guide-contents" aria-label={t("productInfo.guideContentsAria")}>
        <div>
          <h2>{t("productInfo.guideContentsTitle")}</h2>
          <p>{t("productInfo.guideContentsDescription")}</p>
        </div>
        <ol>
          {steps.map((step, index) => (
            <li key={step.id}>
              <a href={`#${step.id}`}><span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>{t(step.shortKey)}</a>
            </li>
          ))}
        </ol>
      </nav>

      <section className="guide-steps" aria-label={t("productInfo.guideContentsTitle")}>
        {steps.map((step, index) => (
          <article key={step.id} id={step.id} className="guide-step-target">
          <Surface className="guide-step">
            <div className="guide-step__heading">
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h2>{`${index + 1}. ${t(step.titleKey)}`}</h2>
            </div>
            <dl>
              <div>
                <dt>{t("productInfo.guideLocationLabel")}</dt>
                <dd>{t(step.locationKey)}</dd>
              </div>
              <div>
                <dt>{t("productInfo.guideCheckLabel")}</dt>
                <dd>{t(step.checkKey)}</dd>
              </div>
            </dl>
            <Link href={step.href} className="guide-step__action">
              <span>{t("productInfo.guideActionLabel")}:</span> {t(step.actionKey)} <span aria-hidden="true">→</span>
            </Link>
          </Surface>
          </article>
        ))}
      </section>

      <section className="product-info-section" aria-labelledby="guide-orientation-title">
        <p className="page-eyebrow">{t("productInfo.guideOrientEyebrow")}</p>
        <h2 id="guide-orientation-title">{t("productInfo.guideOrientTitle")}</h2>
        <div className="guide-areas">
          {areas.map((area) => (
            <Surface key={area.href} className="guide-area">
              <h3>{t(area.titleKey)}</h3>
              <p>{t(area.bodyKey)}</p>
              <Link href={area.href}>{t("productInfo.guideOrientAction")} <span aria-hidden="true">→</span></Link>
            </Surface>
          ))}
        </div>
      </section>

      <section className="product-info-section" aria-labelledby="guide-safety-title">
        <p className="page-eyebrow">{t("productInfo.guideSafetyEyebrow")}</p>
        <h2 id="guide-safety-title">{t("productInfo.guideSafetyTitle")}</h2>
        <p className="product-info-section__description">{t("productInfo.guideSafetyDescription")}</p>
        <div className="guide-safety">
          <Surface>
            <h3>{t("productInfo.privacyTitle")}</h3>
            <p>{t("productInfo.privacyBody")}</p>
          </Surface>
          <Surface>
            <h3>{t("productInfo.marketDataTitle")}</h3>
            <p>{t("productInfo.marketDataBody")}</p>
            <ul>
              <li>{t("productInfo.marketDataDelay")}</li>
              <li>{t("productInfo.intradayBoundary")}</li>
              <li>{t("productInfo.quantSignalBoundary")}</li>
              <li>{t("productInfo.adviceBoundary")}</li>
            </ul>
          </Surface>
        </div>
      </section>

      <Surface className="guide-checklist">
        <p className="page-eyebrow">{t("productInfo.guideChecklistEyebrow")}</p>
        <h2>{t("productInfo.guideChecklistTitle")}</h2>
        <ol>
          {checklist.map((key) => <li key={key}>{t(key)}</li>)}
        </ol>
      </Surface>
    </PageShell>
  );
}
