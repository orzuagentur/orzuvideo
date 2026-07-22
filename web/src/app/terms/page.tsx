import { LegalArticle, LegalH2, SiteChrome } from "@/components/SiteChrome";

export const metadata = {
  title: "Terms of Service — OrzuAi",
  description:
    "Terms governing use of the OrzuAi service at www.orzuai.com.",
};

const UPDATED = "July 22, 2026";

export default function TermsPage() {
  return (
    <SiteChrome>
      <LegalArticle title="Terms of Service" updated={UPDATED}>
        <p>
          These Terms of Service (“Terms”) govern your access to and use of{" "}
          <strong>OrzuAi</strong> at{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="https://www.orzuai.com"
          >
            https://www.orzuai.com
          </a>{" "}
          and related applications (the “Service”). By creating an account or
          using the Service, you agree to these Terms.
        </p>
        <p>
          Questions:{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="mailto:support@orzuai.com"
          >
            support@orzuai.com
          </a>
          .
        </p>

        <LegalH2>1. The Service</LegalH2>
        <p>
          OrzuAi provides tools for creators to configure AI preferences,
          generate scripts and voiceovers, assemble short videos with stock or
          user-provided media, manage a personal music library, browse certain
          third-party asset catalogs, and optionally connect a YouTube channel
          to publish content. Features may change as we improve the product.
        </p>

        <LegalH2>2. Eligibility & accounts</LegalH2>
        <p>
          You must be legally able to enter a contract in your jurisdiction and
          meet any minimum age required for online services (and for YouTube /
          Google, if you connect them). You are responsible for your account
          credentials and for activity under your account. Provide accurate
          information and keep it updated.
        </p>

        <LegalH2>3. Your content</LegalH2>
        <p>
          You retain ownership of content you upload or create with OrzuAi
          (“Your Content”), subject to licenses of third-party assets you use
          (for example Pexels, Poly Haven CC0, or music you upload). You grant
          us a limited license to host, process, transcode, and display Your
          Content solely to operate the Service for you.
        </p>
        <p>
          You represent that you have the rights to use Your Content and that it
          does not violate law or third-party rights (including copyright,
          privacy, and publicity).
        </p>

        <LegalH2>4. AI-generated output</LegalH2>
        <p>
          Scripts, voice, edits, and suggestions may be produced by AI models
          and automation. Output can be inaccurate, incomplete, or unsuitable.
          You are solely responsible for reviewing content before publishing and
          for compliance with platform rules (including YouTube policies).
          OrzuAi does not guarantee any particular performance, reach, or
          monetization result.
        </p>

        <LegalH2>5. Third-party services & licenses</LegalH2>
        <p>
          The Service integrates third parties (for example Supabase, Cloudflare,
          OpenAI, ElevenLabs, Pexels, Google/YouTube, Poly Haven). Your use of
          those services may be subject to their terms and licenses. Stock and
          CC0 assets remain under their respective licenses; you must follow
          them when you download or redistribute.
        </p>
        <p>
          If you use YouTube features, you also agree to the{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="https://www.youtube.com/t/terms"
            target="_blank"
            rel="noreferrer"
          >
            YouTube Terms of Service
          </a>{" "}
          and Google’s privacy policy.
        </p>

        <LegalH2>6. Acceptable use</LegalH2>
        <p>You agree not to:</p>
        <ul className="list-disc space-y-2 pl-5 text-[color:var(--muted)]">
          <li>Break the law or infringe others’ rights</li>
          <li>
            Upload malware, attempt unauthorized access, or overload our
            systems
          </li>
          <li>
            Abuse APIs, scrape beyond normal product use, or resell the Service
            without permission
          </li>
          <li>
            Generate or publish content that is illegal, hateful, exploitative,
            or otherwise prohibited by YouTube / applicable law
          </li>
          <li>Misrepresent AI content as human-made where disclosure is required</li>
        </ul>

        <LegalH2>7. Paid plans (if offered)</LegalH2>
        <p>
          Some features may require a paid subscription. Fees, billing cycles,
          and cancellation rules will be shown at checkout. Unless stated
          otherwise, fees are non-refundable except where required by law.
          Failure to pay may result in suspension of paid features.
        </p>

        <LegalH2>8. Intellectual property</LegalH2>
        <p>
          OrzuAi branding, software, and UI are owned by us or our licensors.
          These Terms do not transfer ownership of our IP to you. Feedback you
          send may be used to improve the Service without obligation to you.
        </p>

        <LegalH2>9. Suspension & termination</LegalH2>
        <p>
          You may stop using OrzuAi at any time. We may suspend or terminate
          access if you violate these Terms, create risk, or if we discontinue
          the Service. Upon termination, your right to use the Service ends; we
          may delete Your Content after a reasonable period unless law requires
          retention.
        </p>

        <LegalH2>10. Disclaimers</LegalH2>
        <p>
          THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE” WITHOUT WARRANTIES
          OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY, FITNESS
          FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant
          uninterrupted or error-free operation, or that generated content will
          meet your expectations.
        </p>

        <LegalH2>11. Limitation of liability</LegalH2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, ORZUAI AND ITS OPERATORS WILL
          NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
          PUNITIVE DAMAGES, OR FOR LOST PROFITS, REVENUE, DATA, OR GOODWILL.
          OUR TOTAL LIABILITY FOR CLAIMS ARISING OUT OF THE SERVICE IS LIMITED TO
          THE AMOUNTS YOU PAID US (IF ANY) IN THE TWELVE (12) MONTHS BEFORE THE
          CLAIM, OR USD $50 IF YOU HAVE NOT PAID.
        </p>

        <LegalH2>12. Indemnity</LegalH2>
        <p>
          You will defend and indemnify OrzuAi against claims arising from Your
          Content, your use of the Service, or your violation of these Terms or
          applicable law, including claims related to videos you publish to
          YouTube or elsewhere.
        </p>

        <LegalH2>13. Changes</LegalH2>
        <p>
          We may update these Terms. We will update the “Last updated” date.
          Continued use after changes constitutes acceptance. If you do not
          agree, stop using the Service.
        </p>

        <LegalH2>14. Governing law</LegalH2>
        <p>
          These Terms are governed by the laws applicable in the jurisdiction
          where the OrzuAi operator is established, without regard to conflict
          of law rules, unless mandatory consumer protections in your country
          say otherwise. Courts in that jurisdiction will have exclusive venue,
          subject to those mandatory rights.
        </p>

        <LegalH2>15. Contact</LegalH2>
        <p>
          OrzuAi ·{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="https://www.orzuai.com"
          >
            https://www.orzuai.com
          </a>
          <br />
          Email:{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="mailto:support@orzuai.com"
          >
            support@orzuai.com
          </a>
        </p>
      </LegalArticle>
    </SiteChrome>
  );
}
