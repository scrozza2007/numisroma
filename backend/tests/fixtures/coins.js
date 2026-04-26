/**
 * Test fixtures for coins
 */

const coinFixtures = {
  validCoin: {
    name: 'RIC I (second edition) Augustus 10',
    authority: {
      emperor: 'Augustus',
      dynasty: 'Julio-Claudian Dynasty'
    },
    description: {
      date_range: '25 BCE–23 BCE',
      mint: 'Emerita',
      denomination: 'Denarius',
      material: 'Silver'
    },
    obverse: {
      legend: 'IMP CAESAR AVGVSTV',
      type: 'Head of Augustus, bare, right',
      portrait: 'Augustus',
      image: 'https://example.com/test-image.jpg'
    },
    reverse: {
      legend: 'P CARISIVS LEG PRO PR EMERITA',
      type: 'City wall, gateway',
      image: 'https://example.com/test-image-reverse.jpg'
    }
  },

  validCoinRIC8: {
    name: 'RIC VIII Alexandria 77',
    authority: {
      emperor: 'Constantius II',
      dynasty: 'Constantinian Dynasty'
    },
    description: {
      date_range: '351 CE–355 CE',
      mint: 'Alexandria',
      denomination: 'Reduced AE2',
      material: 'Billon | Bronze'
    },
    obverse: {
      legend: 'D N CONSTANTI-VS NOB CAES',
      type: 'Bust of Constantius Gallus, bareheaded, draped, cuirassed, right',
      portrait: 'Constantius Gallus',
      image: 'https://example.com/test-constantius.jpg'
    },
    reverse: {
      legend: 'FEL TEMP RE-PARATIO',
      type: 'Soldier, helmeted, draped, cuirassed, advancing left',
      mintmark: '-/-//ALEA',
      image: 'https://example.com/test-constantius-reverse.jpg'
    }
  },

  invalidCoin: {
    // Missing required fields
    authority: {
      emperor: 'Test Emperor'
    }
  },

  multipleCoinsBatch: [
    {
      name: 'RIC I Augustus 100',
      authority: { emperor: 'Augustus', dynasty: 'Julio-Claudian Dynasty' },
      description: { material: 'Silver', denomination: 'Denarius' },
      obverse: { legend: 'Test Legend 1' },
      reverse: { legend: 'Test Reverse 1' }
    },
    {
      name: 'RIC VIII Alexandria 50',
      authority: { emperor: 'Constantius II', dynasty: 'Constantinian Dynasty' },
      description: { material: 'Bronze', denomination: 'AE2', mint: 'Alexandria' },
      obverse: { legend: 'Test Legend 2' },
      reverse: { legend: 'Test Reverse 2' }
    },
    {
      name: 'RIC II Trajan 77',
      authority: { emperor: 'Trajan', dynasty: 'Nerva-Antonine Dynasty' },
      description: { material: 'Gold', denomination: 'Aureus' },
      obverse: { legend: 'Test Legend 3' },
      reverse: { legend: 'Test Reverse 3' }
    }
  ]
};

module.exports = coinFixtures;
