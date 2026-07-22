import { LegalArticle, LegalH2, SiteChrome } from "@/components/SiteChrome";

export const metadata = {
  title: "Privacy Policy — OrzuAi",
  description:
    "How OrzuAi collects, uses, and protects personal data for www.orzuai.com.",
};

const UPDATED = "July 22, 2026";

export default function PrivacyPage() {
  return (
    <SiteChrome>
      <LegalArticle title="Privacy Policy" updated={UPDATED}>
        <p>
          This Privacy Policy explains how <strong>OrzuAi</strong> (“we”, “us”,
          “our”), operating the service at{" "}
          <a className="text-[color:var(--accent)] underline-offset-2 hover:underline" href="https://www.orzuai.com">
            https://www.orzuai.com
          </a>
          , collects and uses information when you use our website and
          dashboard. By using OrzuAi, you agree to this policy.
        </p>
        <p>
          Contact:{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="mailto:support@orzuai.com"
          >
            support@orzuai.com
          </a>
          .
        </p>

        <LegalH2>1. Who we are</LegalH2>
        <p>
          OrzuAi is a software product that helps creators generate, edit, and
          optionally publish short-form videos (including YouTube Shorts). We
          process account data and content you create or upload so the product
          can work.
        </p>

        <LegalH2>2. Information we collect</LegalH2>
        <p>Depending on how you use OrzuAi, we may process:</p>
        <ul className="list-disc space-y-2 pl-5 text-[color:var(--muted)]">
          <li>
            <span className="text-[color:var(--fg)]">Account data</span> —
            email address, display name, authentication identifiers (via
            Supabase Auth).
          </li>
          <li>
            <span className="text-[color:var(--fg)]">YouTube / Google data</span>{" "}
            — if you connect YouTube, we receive OAuth tokens and channel
            metadata needed to upload or manage videos on your behalf. We do
            not sell this data.
          </li>
          <li>
            <span className="text-[color:var(--fg)]">Content you create</span> —
            scripts, training preferences, voice settings, job metadata,
            uploaded music files, clipping sources, and generated video files
            stored in our media storage (Cloudflare R2).
          </li>
          <li>
            <span className="text-[color:var(--fg)]">Usage & technical data</span>{" "}
            — approximate usage for features (for example AI/voice operations),
            IP address, browser type, and logs needed for security and
            debugging.
          </li>
          <li>
            <span className="text-[color:var(--fg)]">Payment data</span> — if
            billing is enabled, payment is handled by a payment provider; we do
            not store full card numbers on our servers.
          </li>
        </ul>

        <LegalH2>3. How we use information</LegalH2>
        <ul className="list-disc space-y-2 pl-5 text-[color:var(--muted)]">
          <li>Provide, maintain, and improve the OrzuAi service</li>
          <li>Authenticate you and secure your account</li>
          <li>
            Generate scripts, voice, and videos using third-party AI and media
            APIs you enable
          </li>
          <li>Publish to YouTube when you explicitly connect and request it</li>
          <li>Respond to support requests and prevent abuse</li>
          <li>Comply with legal obligations</li>
        </ul>

        <LegalH2>4. Third-party services</LegalH2>
        <p>
          We use trusted processors to run OrzuAi. They process data only as
          needed to provide their services to us:
        </p>
        <ul className="list-disc space-y-2 pl-5 text-[color:var(--muted)]">
          <li>
            <span className="text-[color:var(--fg)]">Supabase</span> —
            authentication and database
          </li>
          <li>
            <span className="text-[color:var(--fg)]">Cloudflare R2</span> —
            media file storage
          </li>
          <li>
            <span className="text-[color:var(--fg)]">Vercel</span> — hosting the
            web application
          </li>
          <li>
            <span className="text-[color:var(--fg)]">Google / YouTube</span> —
            OAuth and publishing (when connected)
          </li>
          <li>
            <span className="text-[color:var(--fg)]">OpenAI, ElevenLabs, Pexels</span>{" "}
            and similar providers — scripts, voice, and stock media for
            generation
          </li>
          <li>
            <span className="text-[color:var(--fg)]">Poly Haven</span> — optional
            browsing of CC0 creator assets via their public API
          </li>
        </ul>
        <p>
          Their own privacy policies apply to their processing. YouTube API
          Services are used in compliance with the{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="https://developers.google.com/youtube/terms/api-services-terms-of-service"
            target="_blank"
            rel="noreferrer"
          >
            YouTube API Services Terms of Service
          </a>
          .
        </p>

        <LegalH2>5. Google / YouTube user data</LegalH2>
        <p>
          If you authorize Google/YouTube access, OrzuAi uses that access only
          to provide features you request (for example listing your channel and
          uploading Shorts you create in the app). We do not use YouTube data
          for advertising. You can revoke access at any time in your{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="https://myaccount.google.com/permissions"
            target="_blank"
            rel="noreferrer"
          >
            Google Account permissions
          </a>
          , and/or disconnect YouTube inside OrzuAi.
        </p>

        <LegalH2>6. Cookies & local storage</LegalH2>
        <p>
          We use cookies and similar technologies (including session cookies
          from our auth provider) to keep you signed in and secure the product.
          We do not use third-party advertising cookies on the core app.
        </p>

        <LegalH2>7. Data retention</LegalH2>
        <p>
          We keep account and project data while your account is active. You may
          request deletion of your account and associated personal data by
          emailing{" "}
          <a
            className="text-[color:var(--accent)] underline-offset-2 hover:underline"
            href="mailto:support@orzuai.com"
          >
            support@orzuai.com
          </a>
          . Generated media stored for your account can be deleted with your
          projects or upon verified deletion request, subject to backup cycles
          and legal holds.
        </p>

        <LegalH2>8. Security</LegalH2>
        <p>
          We use industry-standard measures (HTTPS, access-controlled storage,
          authenticated APIs). No method of transmission or storage is 100%
          secure; please use a strong password and protect your account.
        </p>

        <LegalH2>9. Children’s privacy</LegalH2>
        <p>
          OrzuAi is not directed to children under 13 (or the minimum age
          required in your country). We do not knowingly collect personal
          information from children.
        </p>

        <LegalH2>10. Your rights</LegalH2>
        <p>
          Depending on your location, you may have rights to access, correct,
          export, or delete personal data, or object to certain processing.
          Contact us at support@orzuai.com. If you are in the EEA/UK, you may
          also lodge a complaint with your local supervisory authority.
        </p>

        <LegalH2>11. International transfers</LegalH2>
        <p>
          Our providers may process data in the United States and other
          countries. Where required, we rely on appropriate safeguards offered
          by those providers.
        </p>

        <LegalH2>12. Changes</LegalH2>
        <p>
          We may update this Privacy Policy from time to time. The “Last
          updated” date at the top will change. Continued use of OrzuAi after
          changes means you accept the updated policy.
        </p>

        <LegalH2>13. Contact</LegalH2>
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
