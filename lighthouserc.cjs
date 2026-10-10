module.exports = {
  ci: {
    collect: {
      url: ['http://127.0.0.1:4173/', 'http://127.0.0.1:4173/design'], numberOfRuns: 1,
      chromePath: process.env.CHROME_PATH,
      settings: {
        formFactor: 'desktop',
        screenEmulation: { mobile: false, width: 1536, height: 864, deviceScaleFactor: 1, disabled: false },
        throttling: { rttMs: 40, throughputKbps: 10240, cpuSlowdownMultiplier: 1 },
        chromeFlags: '--no-sandbox --disable-dev-shm-usage',
        onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo']
      }
    },
    assert: {
      assertions: {
        'categories:performance': ['error', { minScore: .9 }],
        'categories:accessibility': ['error', { minScore: 1 }],
        'categories:best-practices': ['error', { minScore: .95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2000 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: .05 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }]
      }
    },
    upload: { target: 'filesystem', outputDir: 'docs/evidence/lighthouse' }
  }
};
