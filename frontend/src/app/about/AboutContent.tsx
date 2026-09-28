"use client";

import Link from "next/link";
import ProductInfoNav from "@/components/ProductInfoNav";
import AboutStory from "@/components/AboutStory";
import { useI18n } from "@/components/I18nProvider";
import { PageShell, Surface } from "@/components/ui/Page";

const loopStages = [
  ["productInfo.loopCatalogTitle", "productInfo.loopCatalogBody"],
  ["productInfo.loopDecideTitle", "productInfo.loopDecideBody"],
  ["productInfo.loopExecuteTitle", "productInfo.loopExecuteBody"],
  ["productInfo.loopReviewTitle", "productInfo.loopReviewBody"],
] as const;

export default function AboutContent() {
  const { t } = useI18n();

  return (
    <PageShell width="wide" className="product-info-page about-editorial">
      <ProductInfoNav />
      <AboutStory />

      <section className="product-info-section about-support" aria-labelledby="about-loop-title">
        <p className="page-eyebrow">{t("productInfo.loopEyebrow")}</p>
        <h2 id="about-loop-title">{t("productInfo.loopTitle")}</h2>
        <p className="product-info-section__description">{t("productInfo.loopDescription")}</p>
        <ol className="product-info-loop">
          {loopStages.map(([titleKey, bodyKey], index) => (
            <li key={titleKey} className="product-info-loop__stage">
              <span className="product-info-loop__number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{t(titleKey)}</h3>
                <p>{t(bodyKey)}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="product-info-section about-support" aria-labelledby="about-boundaries-title">
        <p className="page-eyebrow">{t("productInfo.boundariesEyebrow")}</p>
        <h2 id="about-boundaries-title">{t("productInfo.privacyTitle")}</h2>
        <div className="product-info-boundaries">
          <Surface>
            <h3>{t("productInfo.privacyTitle")}</h3>
            <p>{t("productInfo.privacyBody")}</p>
          </Surface>
          <Surface>
            <h3>{t("productInfo.marketDataTitle")}</h3>
            <p>{t("productInfo.marketDataBody")}</p>
            <div className="product-info-boundary-details">
              <p>{t("productInfo.marketDataDelay")}</p>
              <p>{t("productInfo.intradayBoundary")}</p>
              <p>{t("productInfo.quantSignalBoundary")}</p>
            </div>
            <p className="product-info-boundary-note">{t("productInfo.adviceBoundary")}</p>
          </Surface>
        </div>
      </section>

      <Surface className="product-info-version">
        <div>
          <p className="page-eyebrow">{t("productInfo.versionLabel")}</p>
          <strong>{t("productInfo.versionValue")}</strong>
        </div>
        <p>{t("productInfo.versionBody")}</p>
      </Surface>

      <div className="product-info-actions">
        <Link href="/guide" className="ui-button ui-button--primary">{t("productInfo.guideAction")}</Link>
        <Link href="/" className="ui-button">{t("productInfo.appAction")}</Link>
      </div>
    </PageShell>
  );
}
