// The topic rail on /research — grouped quick-start searches practitioners
// actually run. Edit freely: a chip is just a label and the query it runs,
// with optional preset filters. Groups render in this order.

export interface TopicChip {
  label: string;
  q: string;
  /** Optional preset filters applied when the chip is clicked. */
  filters?: { oa?: boolean; review?: boolean; from?: number };
}

export interface TopicGroup {
  group: string;
  chips: TopicChip[];
}

export const TOPIC_GROUPS: TopicGroup[] = [
  {
    group: 'Prevention & places',
    chips: [
      { label: 'Hot spots policing', q: 'hot spots policing' },
      { label: 'Problem-oriented policing', q: 'problem-oriented policing' },
      { label: 'Focused deterrence', q: 'focused deterrence' },
      { label: 'CCTV & surveillance', q: 'CCTV crime prevention' },
      { label: 'Burglary prevention', q: 'residential burglary prevention' },
    ],
  },
  {
    group: 'People & legitimacy',
    chips: [
      { label: 'Procedural justice', q: 'procedural justice policing' },
      { label: 'Police legitimacy', q: 'police legitimacy' },
      { label: 'Stop and search', q: 'stop and search disproportionality' },
      { label: 'Public confidence', q: 'public confidence in policing' },
      { label: 'Neighbourhood policing', q: 'neighbourhood policing' },
    ],
  },
  {
    group: 'Technology',
    chips: [
      { label: 'Body-worn cameras', q: 'body-worn cameras' },
      { label: 'Predictive policing', q: 'predictive policing' },
      { label: 'Facial recognition', q: 'facial recognition policing' },
      { label: 'AI in policing', q: 'artificial intelligence policing' },
    ],
  },
  {
    group: 'Harms',
    chips: [
      { label: 'Domestic abuse', q: 'domestic abuse risk assessment' },
      { label: 'Knife crime', q: 'knife crime prevention' },
      { label: 'Drug markets', q: 'drug market enforcement' },
      { label: 'Online fraud', q: 'online fraud investigation' },
    ],
  },
  {
    group: 'Organisation & workforce',
    chips: [
      { label: 'Evidence-based policing', q: 'evidence-based policing' },
      { label: 'Officer wellbeing', q: 'police officer wellbeing' },
      { label: 'Police culture', q: 'police culture' },
      { label: 'Training & education', q: 'police training education' },
      { label: 'Leadership', q: 'police leadership' },
    ],
  },
];
