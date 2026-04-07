'use client'

export default function PrivacyPage() {
  return (
    <div className="bg-[#070710] min-h-screen" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))', paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Privacy Policy</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 40 }}>Last updated: April 7, 2025</p>

        {[
          {
            title: '1. Introduction',
            body: 'AmpedMap ("we," "us," or "our") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, and safeguard your information when you use our platform at ampedmap.com. By using AmpedMap, you agree to the terms of this policy.',
          },
          {
            title: '2. Information We Collect',
            body: `We collect the following types of information:

• Account information: email address, username, and password when you register.
• Profile data: your tier/plan, badges, and activity stats.
• User-generated content: stock reports, store submissions, community messages, and store lists you create.
• Payment information: processed securely by Stripe. We do not store your credit card details.
• Usage data: pages visited, features used, and general interaction with the platform.`,
          },
          {
            title: '3. How We Use Your Information',
            body: `We use your information to:

• Provide and improve the AmpedMap platform.
• Process payments and manage your subscription.
• Send transactional emails such as account confirmation and password reset.
• Display leaderboard rankings and community features.
• Enforce our Terms of Service and maintain platform integrity.`,
          },
          {
            title: '4. Data Sharing',
            body: `We do not sell your personal data to third parties. We share data only with the following service providers necessary to operate AmpedMap:

• Supabase — database and authentication infrastructure.
• Stripe — payment processing.
• Resend — transactional email delivery.

These providers are contractually obligated to protect your data and may not use it for their own purposes.`,
          },
          {
            title: '5. Data Retention',
            body: 'We retain your data for as long as your account is active. If you delete your account, your personal information is removed from our systems. Content you submitted (such as store listings and stock reports) may be retained in anonymized form to preserve the integrity of the platform.',
          },
          {
            title: '6. Security',
            body: 'We use industry-standard security measures including encrypted connections (HTTPS), secure authentication, and access controls to protect your data. However, no method of transmission over the internet is 100% secure.',
          },
          {
            title: '7. Age Requirement',
            body: 'AmpedMap is intended for users who are 18 years of age or older. By using our platform, you confirm that you meet this age requirement. We do not knowingly collect personal information from anyone under 18.',
          },
          {
            title: '8. Your Rights',
            body: `You have the right to:

• Access the personal data we hold about you.
• Request correction of inaccurate data.
• Delete your account and associated personal data at any time from your account settings.
• Opt out of non-essential communications.

To exercise any of these rights, contact us at the email below.`,
          },
          {
            title: '9. Cookies',
            body: 'AmpedMap uses essential cookies and local storage to maintain your session and preferences. We do not use tracking or advertising cookies.',
          },
          {
            title: '10. Changes to This Policy',
            body: 'We may update this Privacy Policy from time to time. We will notify you of significant changes by posting the new policy on this page with an updated date.',
          },
          {
            title: '11. Contact Us',
            body: 'If you have any questions about this Privacy Policy, please contact us at: support@ampedmap.com',
          },
        ].map(({ title, body }) => (
          <div key={title} style={{ marginBottom: 32 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#22c55e', marginBottom: 10 }}>{title}</h2>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, whiteSpace: 'pre-line' }}>{body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
