---
section: "police-policy"
title: "Joining the Dots: What Palantir's Advance Means for British Policing"
description: "A CIA-seeded American data firm has moved from the edge of UK public-sector IT to a structural position inside defence, health and, increasingly, policing. What has actually been bought, what the software does, and why it is contested."
pubDate: 2026-06-05
tags: ["palantir", "surveillance", "data", "privacy", "civil-liberties", "predictive-policing", "procurement", "policing", "police", "policy"]
---
In June 2026 the contract to run the database that holds every firearms and shotgun certificate in England and Wales — together with Home Office records of explosives, explosive precursors and poisons — was awarded to Palantir Technologies. The value, £9m across all 43 forces, was modest by government-IT standards. The significance was not the money. It was that a company co-founded by Peter Thiel and seeded in its early years by the CIA's venture arm, In-Q-Tel, will now hold the national record of who in this country is licensed to own a gun.

That contract is one data point in a larger pattern. Over roughly five years Palantir has moved from the periphery of UK public-sector technology to a structural position inside British defence, the NHS, financial regulation and, increasingly, policing. The reporting outlets that have tracked this most closely — The Nerve, openDemocracy, Liberty Investigates and The Register among them — put cumulative UK public-sector commitments well above £900m once the September 2025 Ministry of Defence "Strategic Partnership" (up to £750m) and a £240.6m direct-award defence contract signed that December are counted.

This piece sets out what Palantir has actually sold to British policing, how its software works, and why the arrangement is contested. As with most things in this area, the strongest claims and the weakest ones need separating, because the debate is badly served by both the firm's reassurances and its loudest critics.

## What the software does, and what it does not

The first thing to understand is that Palantir does not, as a rule, own or hold the underlying data. Its two flagship products sit as an analytical layer on top of databases the customer already keeps. The clever part is what the company calls an "ontology" — a map that links real-world entities such as people, vehicles, addresses and events across systems that previously could not talk to each other.

Two products matter here. **Gotham**, dating from 2008, is the defence, intelligence and law-enforcement tool, built to connect fragmented and often unstructured material — phone metadata, bank records, sensor feeds, social-media posts, biometrics, geospatial data — into link charts, network maps and "person of interest" dossiers. Its customers have included the US Department of Defense, the CIA, the FBI, the Ukrainian armed forces and, historically, American city police departments. **Foundry**, released later for civilian and commercial use, is built around the same ontology but with more modular deployment; it underpins NHS England's Federated Data Platform and the MoD's data environment. Palantir publishes "drag-and-drop" documentation showing how objects move between the two, and Privacy International concluded in a 2020 review that both products "share the same Palantir DNA".

The consequence is worth stating plainly, because it is the heart of the matter. What gets linked in a policing context is not, in itself, new data. It is existing data made far more searchable, cross-referenceable and actionable. The civil-liberties objection is therefore not really about the code. It is about what becomes possible when criminal records, automatic number-plate recognition, mobile-phone data, financial information, health and immigration records can be queried from a single screen.

For a concrete sense of scale, look at the United States. 404 Media documented that the system Palantir built for Immigration and Customs Enforcement can be filtered by hundreds of categories, including immigration status, scars and tattoos, hair and eye colour, race, social-security number, place of employment and bankruptcy filings, with automated alerts when a "person of interest" surfaces. That is the same architecture, applied without the legal and political restraints that — for now — operate here.

## The UK policing footprint: real, growing, and oddly hidden

The documented footprint in British policing is still narrow, but it is widening and unusually opaque. What has been confirmed, largely through Freedom of Information requests and investigative journalism, amounts to:

- An "intelligence and investigation platform" at Leicestershire Police and the East Midlands Special Operations Unit, worth roughly £818,750, covering organised crime, serious violence and counter-terrorism across five forces.
- A contract at Bedfordshire Police, which has described itself as the "first county in Britain to be policed by AI".
- A multi-force real-time data-sharing pilot known as "Nectar", revealed by Liberty Investigates, processing data from at least nine forces in the East of England, alongside a separate East Midlands pilot.
- A Metropolitan Police misconduct-detection tool priced at £489,999 — a figure that sits, conspicuously, just below the £500,000 threshold that would have triggered formal scrutiny by the Mayor's policing office, according to The Nerve.
- The £9m national firearms-licensing contract described above.

What is striking is not the length of that list but the effort to keep it from public view. The Good Law Project, Big Brother Watch, Liberty Investigates and the BBC have all documented FOI obstruction co-ordinated through the National Police Chiefs' Council's Central Referral Unit, which has advised forces to withhold information about their Palantir work. Big Brother Watch has asked the Information Commissioner's Office to investigate the unit; its head of investigations, Jake Hurfurt, has called it "a danger to transparency and the public's right to know". When a public body works this hard to avoid saying what it has bought, the secrecy itself becomes part of the story.

The Bedfordshire material is the most revealing, because the force's own data protection impact assessment for the Nectar pilot — obtained by Liberty Investigates — disclosed that the data being processed includes political opinions, philosophical beliefs, trade-union membership, sexual orientation, race and health information, relating not only to suspects but to witnesses, victims and children. That is a long way from a tool for catching organised criminals, and it is the kind of detail that disclosure, not obstruction, is supposed to surface.

## The Met block: a precedent worth noting

In May 2026 a larger deal collapsed in public. The Mayor of London, through his deputy for policing, refused to approve a proposed two-year £50m Met contract for AI-driven intelligence analysis, citing what was described as a "clear and serious breach" of procurement rules, value-for-money concerns, and the risk that the force would be "locked into Palantir's technology". Palantir's UK head, Louis Mosley, accused the mayor of putting "politics above public safety". Talks over other Met deployments are reportedly continuing.

The block matters beyond London. It established that procurement-compliance and value-for-money tests are enforceable even against a politically well-connected supplier, which gives other police authorities and commissioners a degree of political cover to ask the same questions.

## Why the worry is about capability, not just current use

Much of the alarm in the UK is anticipatory, and it is reasonable to be sceptical of anticipatory alarm. But the worry has a specific shape, and it is grounded in what has already happened elsewhere.

In the United States, Palantir's tools have been the analytical engine of immigration enforcement for over a decade, from the original Investigative Case Management system through to a sole-source contract awarded in April 2025 to build "ImmigrationOS". The justification documents argued that only Palantir could deliver it, because the firm was "already ingesting and processing data" from multiple federal agencies. The New York Times reported in May 2025 that Palantir was the lead vendor implementing an executive order on breaking down data silos across federal agencies — reporting Palantir disputes, and which a Snopes fact-check landed between the two accounts: the firm is not unilaterally building a master database of Americans, but its architecture and the order together create the conditions in which one could be built. Earlier still, Palantir powered the predictive-policing programmes in New Orleans and Los Angeles, both of which were quietly run, publicly contested, and eventually dismantled, with oversight bodies unable to show they had worked.

The UK relevance is the health and immigration boundary. Campaign groups including Medact, Foxglove and Amnesty International UK argue that the Foundry architecture underpinning the NHS Federated Data Platform would make cross-departmental "drag-and-drop" data sharing available if a future government chose to legislate for it. They point to Reform UK's published "Operation Restoring Justice", which proposes automatic sharing between Home Office, NHS, HMRC, DVLA, banking and police data. It is important to be precise here, and the research underlying this piece is: there is no published evidence that the Home Office is currently using Palantir to cross-reference health, mobile and ANPR data for immigration enforcement. What is documented is the capability, and the separate component contracts — including a £60m Home Office "market engagement" for an application sitting on top of the National Strategic ANPR Platform, which aggregates live number-plate data from all 43 forces. The concern is not that the joined-up system exists. It is that the pieces, and a stated political appetite to connect them, both do.

## The structural objections

Three structural concerns recur, and they are stronger than the speculative ones.

The first is the **US CLOUD Act**. The 2018 law allows American authorities, on a US warrant, to compel US-headquartered providers to produce data they hold or process anywhere in the world. Palantir's answer — repeated by the Financial Conduct Authority in evidence to the Treasury Select Committee — is that under these contracts it is only a "data processor" acting on the customer's instructions, never the "data controller"; that the data stays physically in the UK; and that the UK–US Bilateral Data Access Agreement covers the point. Critics such as the Open Rights Group counter that the controller/processor distinction is "irrelevant under US law". Switzerland's military, in a risk assessment in December 2024, concluded that Palantir-held data "could be accessed by the American government and intelligence services" and recommended domestic alternatives. The UK has moved in the opposite direction, and in June 2026 the Commons Science, Innovation and Technology Committee described the government's reliance on Palantir, Amazon and Microsoft as an "unacceptable point of weakness", expressly invoking CLOUD Act exposure.

The second is **supplier lock-in**. Once an organisation's data is mapped into a Palantir ontology, the cost of leaving rises steeply. That is a commercial risk of the ordinary kind, but at national-infrastructure scale it shades into a question of sovereignty.

The third is the **revolving door**. The Nerve's 2026 investigation traced at least 32 former UK officials into Palantir advisory or staff roles, including a former head of MI6, the MoD's senior artificial-intelligence official, NHS England's former director of AI, two former ministers and a former chief adviser to the prime minister. openDemocracy reported that a former MoD director of policy joined the firm nine days after leaving the department; three months later the £240m direct-award contract was signed. None of this is, in itself, proof of impropriety. It is the kind of pattern that makes the public-interest case for transparency, rather than against it.

## Palantir's answer

Palantir's position deserves to be stated at its strongest, because parts of it are well-founded. The company says it supplies software, not policy: the customer controls the data, who can see it, and what it is used for. It says it cannot aggregate data across its different customers, and rejects the suggestion that its ten-plus UK government deployments add up to a single dataset. It argues that its tools improve civil liberties rather than degrade them, through granular role-based access controls and full audit logging — Alex Karp has said the design ensures "the state and its agents can see only what ought to be seen". It disputes the "predictive policing" label entirely, including for Nectar, and says it has no means or intention of using NHS data in the way its critics describe.

Some of this is genuine. Access controls and audit logs are real features, and a well-governed Palantir deployment is more accountable than the spreadsheet-and-email sprawl it often replaces. But the reassurance and the criticism are answering different questions. The firm is right that it is not, today, building Britain a surveillance state. The critics are right that the technical and contractual pieces of one would be easier to assemble than they have ever been, and that the body politic has not yet decided where the line sits. Software that can "see only what ought to be seen" still depends entirely on who gets to decide what ought to be seen.

## What this means for policing leaders

The defensible posture for a chief officer or police and crime commissioner is neither to treat Palantir as uniquely sinister nor to wave it through as just another IT contract. A few things follow from the evidence.

Disclose first. Any force using or piloting Palantir would be better placed publishing the contract value, the data categories ingested, the impact assessment and the oversight arrangements voluntarily, rather than being dragged there by FOI. The Central Referral Unit's instinct to withhold is becoming a reputational liability and an invitation to ICO action; getting ahead of it is cheaper than being caught by it.

Draw the line between intelligence analysis and prediction. Procurement papers should state plainly whether a deployment generates individual-level risk scores or watchlists, and if so, on what statutory basis. The Conservative MP David Davis has argued that current police adoption is happening "without the necessary statutory underpinning"; that argument gets harder to rebut the longer forces decline to draw the line themselves.

Treat lock-in as a strategic risk on a par with cyber risk, and require written exit and data-portability plans before any extension. And get independent legal advice on CLOUD Act exposure for sensitive datasets, and document it, rather than relying on the supplier's account of its own obligations.

The wider point is that this is arriving faster than the rules governing it. The firearms-licensing award, the Met block, the December 2025 defence direct-award and the American "master database" reporting have all landed inside a single year. The question facing British policing is not whether data integration of this kind is useful — it plainly is — but whether the country decides what it is for before the architecture decides for it.

---

*Sources for the figures and events above include reporting by The Register, The Nerve, openDemocracy, Liberty Investigates, the Good Law Project, Big Brother Watch, 404 Media, The Intercept and the New York Times, alongside GOV.UK contract notices, the Commons Science, Innovation and Technology Committee, and Palantir's own published statements. The fast-moving nature of this story means specific figures and contract details may have changed since writing.*
