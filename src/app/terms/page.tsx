'use client'

export default function TermsPage() {
  return (
    <div className="bg-[#070710] min-h-screen" style={{ paddingTop: 'calc(56px + env(safe-area-inset-top))', paddingBottom: 'calc(70px + env(safe-area-inset-bottom))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Terms of Service</h1>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', marginBottom: 40 }}>Last updated: April 7, 2025</p>

        {[
          {
            title: '1. Acceptance of Terms',
            body: 'By accessing or using AmpedMap ("the platform") at ampedmap.com, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform. AmpedMap is operated in the United States.',
          },
          {
            title: '2. Eligibility',
            body: 'You must be at least 18 years old to use AmpedMap. By creating an account, you represent and warrant that you meet this requirement.',
          },
          {
            title: '3. Accounts',
            body: `You are responsible for maintaining the confidentiality of your account credentials. You agree to:

• Provide accurate information when creating your account.
• Use a username that does not impersonate others or violate any rights.
• Notify us immediately of any unauthorized use of your account.

We reserve the right to suspend or terminate accounts that violate these terms.`,
          },
          {
            title: '4. Subscriptions and Payments',
            body: `AmpedMap offers free and paid subscription tiers (Tracker at $10/month). By subscribing to a paid tier:

• You authorize us to charge your payment method on a recurring monthly basis.
• Subscriptions renew automatically unless cancelled.
• You may cancel at any time from your account settings. Access continues until the end of the current billing period.
• We do not offer refunds for partial billing periods.

Payments are processed by Stripe. By subscribing, you also agree to Stripe's Terms of Service.`,
          },
          {
            title: '5. User Content',
            body: `By submitting content to AmpedMap (including stock reports, store listings, photos, and community messages), you grant us a non-exclusive, royalty-free license to display and use that content on the platform.

You agree not to submit content that is:
• False, misleading, or inaccurate.
• Offensive, harassing, or harmful to others.
• In violation of any third-party rights.

We reserve the right to remove any content that violates these terms.`,
          },
          {
            title: '6. Prohibited Conduct',
            body: `You agree not to:

• Use the platform for any unlawful purpose.
• Attempt to access other users' accounts or data.
• Spam, scrape, or abuse the platform's features.
• Manipulate leaderboard rankings or submit false reports.
• Reverse engineer or copy any part of the platform.`,
          },
          {
            title: '7. Tier Features',
            body: 'Features available on each tier are described on the platform and may change over time. We reserve the right to modify tier features with reasonable notice. Beta pricing and features offered during the founding period are subject to change.',
          },
          {
            title: '8. Disclaimers',
            body: 'AmpedMap is provided "as is" without warranties of any kind. We do not guarantee the accuracy of stock reports or store information submitted by users. We are not responsible for any decisions made based on information found on the platform.',
          },
          {
            title: '9. Limitation of Liability',
            body: 'To the maximum extent permitted by law, AmpedMap shall not be liable for any indirect, incidental, or consequential damages arising from your use of the platform. Our total liability to you shall not exceed the amount you paid us in the past 12 months.',
          },
          {
            title: '10. Termination',
            body: 'We reserve the right to suspend or terminate your account at our discretion if you violate these terms. You may delete your account at any time from your account settings.',
          },
          {
            title: '11. Governing Law',
            body: 'These Terms are governed by the laws of the United States. Any disputes shall be resolved in the applicable courts of the United States.',
          },
          {
            title: '12. Changes to Terms',
            body: 'We may update these Terms from time to time. Continued use of the platform after changes constitutes your acceptance of the updated terms.',
          },
          {
            title: '13. Contact',
            body: 'For questions about these Terms, contact us at: support@ampedmap.com',
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
