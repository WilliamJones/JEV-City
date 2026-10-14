import type { ReactNode } from 'react';
import { ACTION_COLOR, ACTION_LABEL, hex } from '@/client/palette';
import { ACTION_IDS } from '@/sim/types';
import { ActionGlyph } from './ActionGlyph';

export type HelpSection = { id: string; title: string; summary: string; body: ReactNode };

const K = ({ children }: { children: ReactNode }) => (
  <kbd className="rounded border px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px]" style={{ borderColor: 'var(--panel-border)', background: 'var(--chip)' }}>{children}</kbd>
);
const H = ({ children }: { children: ReactNode }) => <h4 className="mb-1.5 mt-5 text-sm font-bold first:mt-0">{children}</h4>;
const P = ({ children }: { children: ReactNode }) => <p className="mb-2.5 text-sm leading-relaxed" style={{ color: 'var(--ink-soft)' }}>{children}</p>;
const Badge = ({ color, children }: { color: string; children: ReactNode }) => (
  <span className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wider text-white" style={{ background: color }}>{children}</span>
);
const Row = ({ k, children }: { k: ReactNode; children: ReactNode }) => (
  <div className="grid grid-cols-[minmax(110px,150px)_1fr] gap-3 border-t py-2 text-sm first:border-t-0" style={{ borderColor: 'var(--panel-border)' }}>
    <div className="font-semibold">{k}</div>
    <div style={{ color: 'var(--ink-soft)' }}>{children}</div>
  </div>
);

export const HELP: HelpSection[] = [
  {
    id: 'overview',
    title: 'What am I looking at?',
    summary: 'A tiny city where every citizen decision comes from an AI model called JEV.',
    body: (
      <>
        <P>JEV City is a miniature town with <b>25 citizens</b>. Every few seconds a citizen has to decide what to do next — keep to their routine, go home, find shelter, help a neighbor, get supplies, report for duty, or wait. <b>That decision is made by JEV</b>, a decision model from TypeSafe AI that returns typed answers with probabilities instead of paragraphs of text.</P>
        <P>Everything else — walking, traffic, power cuts, the meteor — is ordinary simulation code. The point of the demo is to let you <b>see and inspect each AI decision</b>: what the citizen knew, which options were possible, how likely JEV thought each one was, and how long it took.</P>
        <H>The 30-second version</H>
        <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li>Pick a scenario at the top (Morning, Blackout or Meteor).</li>
          <li>Watch the little bubbles that pop above people — each one is a fresh decision.</li>
          <li>Click any citizen (or a name in the side panel) to open the <b>inspector</b> and see exactly what JEV returned.</li>
        </ol>
        <H>How one decision works</H>
        <ol className="list-decimal space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li>The simulation works out which actions are <b>physically possible</b> right now (e.g. no “seek shelter” if the shelter is unreachable).</li>
          <li>It sends JEV the citizen’s situation and those options, plus three side questions (perceived risk, duty pressure, and whether they’d abandon their routine) — all in one request.</li>
          <li>JEV returns a probability for each option. The citizen does the <b>top choice</b>, a moment later starts walking, and a bubble shows the choice.</li>
        </ol>
      </>
    ),
  },
  {
    id: 'controls',
    title: 'Controls & shortcuts',
    summary: 'Scenario, play/pause, speed, day/night, engine, camera.',
    body: (
      <>
        <Row k="Scenario tabs">Switch between Ordinary Morning, Citywide Blackout and Meteor Near the Market. Switching restarts the city from the beginning.</Row>
        <Row k="Pause / Play">Freeze or resume time. Shortcut <K>Space</K>.</Row>
        <Row k="Reset">Restart the current scenario.</Row>
        <Row k="1× 2× 4×">Simulation speed. 1× is one simulated minute per real second.</Row>
        <Row k="Day / Night">Change the lighting. Shortcut <K>N</K>. (The blackout scenario starts at dusk.)</Row>
        <Row k="JEV replay / Rules / Live JEV">Which decision engine drives the citizens — see <i>Modes &amp; labels</i>.</Row>
        <Row k="Map">Drag to pan, scroll to zoom, click a person to inspect them. <b>Recenter</b> resets the camera.</Row>
        <Row k="Replay intro">Re-runs the guided opener that spotlights four real JEV decisions.</Row>
        <Row k="Keyboard"><K>?</K> help · <K>L</K> map legend · <K>Space</K> pause · <K>N</K> night · <K>Esc</K> close inspector/help</Row>
      </>
    ),
  },
  {
    id: 'inspector',
    title: 'Reading the inspector',
    summary: 'Top choice vs enacted, probabilities, the two scores and the yes/no answer.',
    body: (
      <>
        <P>Click a citizen to open the inspector. It always shows their <b>latest</b> decision.</P>
        <H>Choice probabilities</H>
        <P>One bar per action that was <b>feasible at that moment</b> — impossible actions are never sent to JEV, so they never appear. Bars are sorted from most to least likely. Percentages are rounded.</P>
        <Row k={<span className="rounded px-1 py-px text-[10px] font-bold text-white" style={{ background: 'var(--teal)' }}>TOP CHOICE</span>}>The action JEV rated most likely.</Row>
        <Row k={<span className="rounded px-1 py-px text-[10px] font-bold" style={{ border: '1px solid var(--ink)' }}>ENACTED</span>}>What the citizen actually did. Normally identical to the top choice. If they differ, a <b>Guardrail</b> note explains why — usually the world changed during the short think time and the chosen action was no longer possible, so the citizen waits instead.</Row>
        <Row k="Confidence">JEV’s own confidence in the choice (0–100%).</Row>
        <H>Perceived risk &amp; duty pressure (scores 0–3)</H>
        <P>Two separate questions answered on a 0–3 rubric. The big number is a probability-weighted average (e.g. 1.96 ≈ “mostly level 2”). The four small bars show how likely each level was; the sentence underneath is the rubric text for the nearest level.</P>
        <Row k="Perceived risk">How much danger the citizen would feel — 0 no threat, 3 immediate danger.</Row>
        <Row k="Duty pressure">How strongly their role or a nearby person creates a responsibility to help — 0 none, 3 explicit emergency duty.</Row>
        <H>Would interrupt routine (yes/no)</H>
        <P>A single probability that this citizen would abandon their normal plan right now. All three side answers are <b>independent judgments</b> on the same situation — they help you understand the context but do not mechanically drive the choice.</P>
        <H>What JEV saw</H>
        <P>The citizen’s personality traits (caution, altruism, sociability), current needs (fatigue, supply need) and situation tags — the same facts sent to JEV.</P>
        <H>Provenance</H>
        <P>Where this decision came from, which model answered, the measured round-trip time, token counts and an estimated cost. See <i>Measurements &amp; honesty</i>.</P>
      </>
    ),
  },
  {
    id: 'modes',
    title: 'Modes & labels',
    summary: 'Recorded replay, rules, live JEV and fallback — what each label means.',
    body: (
      <>
        <P>The badge next to the logo shows the current engine. Every individual decision also carries its own label in the inspector.</P>
        <Row k={<Badge color="var(--teal)">RECORDED REPLAY</Badge>}>The default. Plays back <b>real JEV decisions captured earlier</b> for this exact scenario. Your browser makes no AI calls, and timings are marked “historical”. Because the simulation is deterministic, the replay unfolds exactly as the original live run did.</Row>
        <Row k={<Badge color="#8a97a6">RULES BASELINE</Badge>}>A hand-written heuristic runs locally instead of JEV — useful for comparison. Its bars are developer weights, <b>not</b> model probabilities.</Row>
        <Row k={<Badge color="var(--coral)">LIVE JEV</Badge>}>Every decision is a real call to JEV made right now, through a protected server. Greyed out when the site owner hasn’t enabled it; requires a passcode when it is enabled. Usage is capped.</Row>
        <Row k={<Badge color="var(--amber)">FALLBACK</Badge>}>JEV didn’t provide this particular decision (for example a live call timed out or the budget ran out), so the rules baseline filled in. The inspector says why. Fallbacks are always labeled — they are never passed off as JEV.</Row>
      </>
    ),
  },
  {
    id: 'scenarios',
    title: 'The three scenarios',
    summary: 'What happens, and when, in each scenario.',
    body: (
      <>
        <P>The banner at the top of the map always tells you which phase you’re in.</P>
        <H>☀︎ Ordinary Morning (starts 07:40)</H>
        <P>No emergency. Commuters head to the office tower, vendors open the market, retirees stroll and people run out of supplies. Watch how different personalities make different everyday choices.</P>
        <H>⚡︎ Citywide Blackout (starts 18:50)</H>
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li><b>~18:56</b> — the substation fails. Lights go out in a wave spreading from it; traffic signals go dark and intersections become all-way stops.</li>
          <li>The market and office close; the corner store stays open by lantern; the clinic switches to its generator (pulsing red glow).</li>
          <li>Three older residents get stuck in the dark (red <b>!</b>). Neighbors, nurses and responders decide whether to help.</li>
          <li><b>~21:40</b> — power is restored, spreading back out from the substation.</li>
        </ul>
        <H>☄︎ Meteor Near the Market (starts 12:30)</H>
        <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li><b>~12:35</b> — a streak appears in the sky; a shadow grows on the plaza.</li>
          <li><b>12:39</b> — impact. A crater opens beside the market; the coral dashed ring and cones mark a closed zone no one can enter. Three people nearby are stranded.</li>
          <li><b>~13:40</b> — an excavator and cleanup crew arrive and the crater gradually fills in.</li>
          <li><b>~15:00</b> — roads reopen, the crater is paved over, stalls are rebuilt and life returns to normal.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'legend',
    title: 'Map legend',
    summary: 'Every icon, ring and color on the map.',
    body: (
      <>
        <H>Decision bubbles</H>
        <P>When a citizen makes a decision, a bubble pops above them for a few seconds and a colored ring ripples out from their feet. The same colors are used everywhere in the app.</P>
        <div className="mb-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {ACTION_IDS.map((a) => (
            <div key={a} className="flex items-center gap-2 text-sm">
              <ActionGlyph action={a} />
              <span className="inline-block h-2 w-2 rounded-sm" style={{ background: hex(ACTION_COLOR[a]) }} />
              {ACTION_LABEL[a]}
            </div>
          ))}
        </div>
        <H>On the ground</H>
        <Row k="Colored ring at a spot">Where a citizen just decided to go (fades after a few seconds).</Row>
        <Row k="Dashed line">The route of the citizen you’re inspecting.</Row>
        <Row k="White ring">The citizen currently selected in the inspector.</Row>
        <Row k={<span style={{ color: 'var(--coral)' }}>Red ! bubble</span>}>Someone stranded who needs help. They stay put until a neighbor or responder reaches them.</Row>
        <Row k="“3 inside”">How many people are inside the clinic or the shelter.</Row>
        <Row k="Coral dashed ring + cones">Closed area after the meteor — impassable for people and cars.</Row>
        <H>Buildings</H>
        <Row k="Red cross roof">Clinic — healthcare workers report here; glows when on generator power.</Row>
        <Row k="Teal roof, shield">Community shelter.</Row>
        <Row k="Striped awning">Market hall (coral) and corner store (yellow).</Row>
        <Row k="Red, garage doors">Fire &amp; rescue station — responders’ base.</Row>
        <Row k="Lightning bolt">Power substation — where the blackout starts.</Row>
        <Row k="Tall glass tower">Office — many commuters work here.</Row>
        <H>People</H>
        <Row k="White outfit, teal cross">Healthcare worker (nurse, doctor).</Row>
        <Row k="Red outfit, yellow stripe & helmet">Responder (firefighter, paramedic).</Row>
        <Row k="Apron">Service worker (vendor, shopkeeper, barista).</Row>
        <Row k="Orange vest, white hat">Meteor cleanup crew (scenery, not a citizen).</Row>
        <H>Traffic</H>
        <P>Cars, traffic lights and the fountain are <b>scenery</b> — they make the city feel alive but are not controlled by JEV and never affect decisions. Signals cycle green → yellow → red; during the blackout they go dark and cars treat intersections as all-way stops.</P>
      </>
    ),
  },
  {
    id: 'performance',
    title: 'Measurements & honesty',
    summary: 'What the speed, cost and token numbers mean — and what they don’t.',
    body: (
      <>
        <P>This demo follows strict rules: <b>no simulated or invented numbers</b>. If something wasn’t measured, the app says “Not measured”.</P>
        <Row k="Upstream round-trip">Time from our server sending the request to JEV until the answer arrived. In replay mode this is the historical value recorded when the decision was captured.</Row>
        <Row k="Browser round-trip">(Live mode only) Time from your browser asking to getting the answer, including the trip to our server.</Row>
        <Row k="p50 / p95">The median and the 95th-percentile time across all decisions (95% were faster than the p95). <i>n</i> is how many decisions were measured.</Row>
        <Row k="Tokens">How much text JEV read (input) and wrote (output), as reported by JEV.</Row>
        <Row k="Est. API cost">Tokens × TypeSafe’s published price ($0.042 per million input tokens; output is free). An estimate, not a bill — a single decision costs about four thousandths of a cent.</Row>
        <P>Schema-valid answers aren’t automatically <i>good</i> answers. Whether JEV decides <b>well</b> is a separate question we’re measuring with blind human ratings (pending).</P>
      </>
    ),
  },
  {
    id: 'benchmark',
    title: 'The benchmark',
    summary: 'JEV vs conventional AI models on identical decisions.',
    body: (
      <>
        <P>The <a href="/benchmark" className="font-semibold underline" style={{ color: 'var(--teal)' }}>benchmark page</a> asks JEV, two conventional language models (gpt-4o-mini and gemini-2.5-flash) and the rules baseline to make the <b>same 60 citizen decisions, three times each</b>, and publishes every measurement.</P>
        <Row k="Track A">Models only pick an action — the simplest possible task.</Row>
        <Row k="Track B">Models pick an action and give a probability for every option — what this app’s inspector needs.</Row>
        <Row k="Repeatability">How often a model gave the same answer on all three tries. A consistency measure, not a quality score.</Row>
        <Row k="Agrees with JEV">How often another engine picked the same action as JEV. Describes similarity, not correctness.</Row>
        <P>You can download every individual call as JSON from the benchmark page.</P>
      </>
    ),
  },
  {
    id: 'faq',
    title: 'FAQ & troubleshooting',
    summary: 'Common questions.',
    body: (
      <>
        <Row k="Why does the replay look the same every time?">It’s a recording of one real run. The simulation is deterministic, so the same recorded decisions always produce the same city — that’s how we can prove the replay is faithful.</Row>
        <Row k="Why is a choice sometimes 100%?">In clear-cut situations JEV is very certain. In most decisions (over 90%) it spreads probability across several options.</Row>
        <Row k="Why did someone do something different from the top choice?">A guardrail applied — the world changed in the moment between asking and acting, so the original choice became impossible. The inspector shows the reason.</Row>
        <Row k="Why does the clock say “awaiting JEV…”?">Live mode only: the city pauses briefly if an answer is late rather than letting network speed change what happens.</Row>
        <Row k="Why can’t I click Live JEV?">The site owner hasn’t enabled live calls on this deployment. Recorded replay shows real JEV output without spending anything.</Row>
        <Row k="I see a FALLBACK label">JEV didn’t provide that decision; the inspector shows why. If it happens in replay mode, reload the page — you may be running an older version.</Row>
        <Row k="People walk through cars!">Traffic is scenery; cars stop for people in front of them, but pedestrians aren’t simulated as traffic participants.</Row>
        <Row k="The page feels slow on my phone">Try 1× speed and Day lighting; the city is fully playable in portrait — scroll down for the panels.</Row>
      </>
    ),
  },
  {
    id: 'glossary',
    title: 'Glossary',
    summary: 'JEV, choice, score, noul, feasible actions…',
    body: (
      <>
        <Row k="JEV">TypeSafe AI’s “System One” decision model. Here pinned to version <code>jev-1.13.0</code>.</Row>
        <Row k="Choice">A JEV question type: pick one option and return a probability for each.</Row>
        <Row k="Score">A JEV question type: rate on a rubric (here 0–3) with a probability for each level.</Row>
        <Row k="Noul">A JEV question type: a single yes-probability between 0 and 1.</Row>
        <Row k="Feasible actions">The options the simulation allows right now. JEV only ever chooses among these.</Row>
        <Row k="Top choice (argmax)">The highest-probability option; citizens do this unless a guardrail applies.</Row>
        <Row k="Guardrail">A safety/feasibility rule in code that can override a choice; always labeled.</Row>
        <Row k="Replay">Playback of real recorded decisions; no live AI calls.</Row>
        <Row k="Fallback">A rules-based stand-in used when JEV didn’t answer; always labeled.</Row>
        <Row k="Tick">One step of the simulation (6 simulated seconds).</Row>
      </>
    ),
  },
];
