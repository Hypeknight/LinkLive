(function () {
  window.LinkdNV2State = {
    VENUE_STATUS: {
      DISCONNECTED: 'DISCONNECTED',
      CONNECTED_EMPTY: 'CONNECTED_EMPTY',
      PRESENT: 'PRESENT',
      WARMING: 'WARMING',
      READY: 'READY',
      LIVE: 'LIVE',
      COOLING: 'COOLING',
      UNAVAILABLE: 'UNAVAILABLE'
    },
    OPPORTUNITY_STATUS: ['suggested','queued','offered','accepted','rejected','expired','canceled','launched'],
    PORTAL_STATUS: ['proposed','pending_acceptance','accepted','activating','live','extending','closing','closed','rejected','expired'],
    EXPERIENCE_STATUS: ['passive','building','active','continuation_check','winding_down','closed'],
    CTA_TYPES: ['vote','comment','yell']
  };
})();
