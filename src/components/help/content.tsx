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
        <P>JEV City is a miniature town with <b>25 citizens</b> (and a separate <b>Big City</b> with 100). Every few seconds a citizen has to decide what to do next — keep to their routine, go home, find shelter, help a neighbor, get supplies, report for duty, wait, get medical care, move away from danger, check on family, warn others, join a festival, restore power (utility staff) or direct traffic (responders). <b>That decision is made by JEV</b>, a decision model from TypeSafe AI that returns typed answers with probabilities instead of paragraphs of text.</P>
        <P>Everything else — walking, traffic, fire, floodwater, the meteor, the clinic — is ordinary simulation code. The point of the demo is to let you <b>see and inspect each AI decision</b>: what the citizen knew, which options were possible, how likely JEV thought each one was, and how long it took.</P>
        <P><b>Decisions have consequences.</b> When someone chooses to warn others, the people they reach learn about the danger and make their own next decisions with that knowledge. Someone checking on family may find them — or discover they’ve moved on. Responders who choose to join the fire crew make the fire go out sooner. Utility workers who choose to restore power drive a van through real traffic and do the repair — the lights come back only when the work is done. A responder directing a dark intersection really moves more cars through it (measured: ~3.5× more than an all-way stop in the same blackout). Open any citizen’s <i>Why did the world change?</i> trail to follow the chain.</P>
        <H>The 30-second version</H>
        <ol className="mb-2 list-decimal space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li>Pick a scenario at the top: Morning, Blackout, Meteor, Fire, Festival, Flood, Meteor + Outage, or Big City.</li>
          <li>Watch the little bubbles that pop above people — each one is a fresh decision.</li>
          <li>Click any citizen (or a name in the side panel) to open the <b>inspector</b> and see exactly what JEV returned.</li>
        </ol>
        <H>How one decision works</H>
        <ol className="list-decimal space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li>The simulation works out which actions are <b>physically possible</b> right now (e.g. no “seek shelter” if the shelter is unreachable).</li>
          <li>It sends JEV the citizen’s situation and those options, plus three side questions (perceived risk, duty pressure, and whether they’d abandon their routine) — all in one request.</li>
          <li>JEV returns a probability for each option. The citizen does the <b>top choice</b>, a moment later starts walking, and a bubble shows the choice.</li>
          <li>If only <b>one</b> safe option exists (say, someone standing in deep floodwater), no model is asked: the simulation moves them and labels it <b>SAFETY RULE</b>.</li>
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
        <Row k="Scenario tabs">Switch between Morning, Blackout, Meteor, Fire, Festival, Flood, Meteor + Outage and Big City (hover a tab for its full name; swipe the row on a phone). Switching restarts the city from the beginning.</Row>
        <Row k="Big City tools">Search and filter the 100 citizens by name, job, role or status in the side panel; jump the camera to a neighbourhood (NW · NE · ◎ · SW · SE) or <b>Fit city</b>; press <b>◎ Follow</b> in the inspector to keep the camera on one person.</Row>
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
        <H>Status chips</H>
        <P>Under the name: injuries, whether they’re waiting or being treated at the clinic, <b>how they know about the emergency</b> (saw it first-hand, got the official alert, were warned by a named neighbor — or don’t know yet), and who they live with.</P>
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
        <H>Why did the world change?</H>
        <P>A short history of this citizen’s decisions and what followed, newest first. Every line is labeled by what produced it: a <b>recorded JEV decision</b>, a <b>rules</b> or <b>fallback</b> decision, a <b>safety rule</b>, or <b>simulation</b> logic (walking, delivering a warning, treatment, closures). JEV only ever chooses the action — it never moves anyone or changes the map itself. Click another person’s name in the trail to jump to them.</P>
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
        <Row k={<Badge color="#4f9d63">SAFETY RULE</Badge>}>Only one safe option existed (for example, the citizen was standing in deep water or right next to the flames), so no model was asked and the simulation acted. Also used when a newly closed area pushes someone out. Shown with a green shield on the map.</Row>
        <Row k={<Badge color="var(--amber)">FALLBACK</Badge>}>JEV didn’t provide this particular decision (for example a live call timed out or the budget ran out), so the rules baseline filled in. The inspector says why. Fallbacks are always labeled — they are never passed off as JEV.</Row>
      </>
    ),
  },
  {
    id: 'scenarios',
    title: 'The scenarios',
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
          <li>Three older residents get stuck in the dark (red <b>!</b>). Neighbors, nurses and responders decide whether to help. Later someone trips in the dark. Everyone may also go looking for housemates they haven’t seen since the lights went out.</li>
          <li><b>19:02</b> — the substation is isolated and safe to work on. Its two utility staff can now choose <b>Restore power</b>: each walks to a van, drives through the dark (and possibly jammed) streets, and works on site. One worker takes 240 work-ticks; two halve that.</li>
          <li>Responders may choose <b>Direct traffic</b> at a backed-up dark intersection, turning an all-way stop back into a flowing junction.</li>
          <li><b>20:26</b> — if the repair still isn’t finished, a backup utility crew is dispatched from out of town and must drive in too.</li>
          <li>The lights come back — spreading out from the substation — <b>only when the repair is done</b>. The banner and event feed credit whoever actually did it.</li>
        </ul>
        <H>☄︎ Meteor Near the Market (starts 12:30)</H>
        <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li><b>~12:35</b> — a streak appears in the sky; a shadow grows on the plaza.</li>
          <li><b>12:39</b> — impact. A crater opens beside the market; the coral dashed ring and cones mark a closed zone no one can enter. Three people nearby are hurt and stranded; two more get minor cuts from flying debris and may choose to visit the clinic.</li>
          <li><b>~13:40</b> — an excavator and cleanup crew arrive and the crater gradually fills in.</li>
          <li><b>~15:00</b> — roads reopen, the crater is paved over, stalls are rebuilt and life returns to normal.</li>
        </ul>
        <H>☄︎⚡︎ Meteor Strike + Power Failure (starts 17:40)</H>
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li><b>17:58</b> — meteor warning over the utility corridor.</li>
          <li><b>18:10</b> — impact beside the substation: a crater closes nearby roads, three people are hurt and stranded — and the damaged feeder knocks the power out, spreading outward block by block. Citizens see the dark; they aren’t told why.</li>
          <li><b>18:22</b> — the site is safe for utility repairs. <b>18:50</b> — a road crew arrives at the crater.</li>
          <li><b>19:40</b> — backup utility crew dispatched if repairs aren’t done. <b>20:00</b> — the crater is cleared and the road reopens.</li>
          <li>Two independent recoveries: power can come back before the road reopens, or the other way round — the banner tells you which.</li>
        </ul>
        <H>▦ Big City Blackout (starts 18:40)</H>
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li>A separate 44×44 city with <b>100 citizens</b> (70 residents, 10 service, 8 healthcare, 8 responders, 4 utility), two clinics, two shelters, two fire stations, apartments and a park.</li>
          <li><b>18:46</b> — the grid fails. Same rules as the blackout: utility staff can restore power, responders can direct traffic, six older residents get stuck in the dark, and a backup crew is dispatched at <b>20:16</b> if needed.</li>
        </ul>
        <H>♨︎ Office Fire (starts 15:10)</H>
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li><b>15:16</b> — light smoke curls from the office roof. Only people close by (or inside) notice. <b>Everyone else doesn’t know</b> — unless someone chooses to warn them.</li>
          <li><b>15:30</b> — flames break out. Office workers are evacuated (a labeled safety rule), red-and-white tape cordons off the block, and one person is overcome by smoke.</li>
          <li><b>15:36</b> — the fire engine leaves the station; responders and clinic staff get the official call.</li>
          <li><b>~15:53</b> — the engine arrives and starts spraying. Every responder who <b>chose to report for duty</b> and stands at the crew post speeds this up — the banner shows how many.</li>
          <li>Once the fire is out, crews cool the building for about 25 minutes, then the streets reopen. Soot marks stay on the tower.</li>
        </ul>
        <H>♫ Street Festival (starts 17:00)</H>
        <ul className="mb-2 list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li>Stalls, bunting and a stage go up on the market plaza; the plaza road closes to cars.</li>
          <li><b>17:20</b> — the festival opens. Citizens can now choose <b>Attend festival</b>. The crowd counter only counts citizens who actually chose to go — the musicians and the grey-toned out-of-town visitors are scenery.</li>
          <li><b>17:40</b> onward — in full swing; the light turns golden as evening falls.</li>
          <li><b>18:40</b> — closing announcement and fireworks; visitors drift away.</li>
          <li><b>19:10</b> — stalls are packed away and the road reopens.</li>
        </ul>
        <H>☂︎ Flash Flood (starts 16:00)</H>
        <ul className="list-disc space-y-1 pl-5 text-sm" style={{ color: 'var(--ink-soft)' }}>
          <li><b>16:06</b> — dark clouds and heavy rain.</li>
          <li><b>16:15</b> — a cloudburst: water starts pooling around home 7, the lowest ground in town, and spreads outward. Deep water (dark blue) closes streets to people; any water closes them to cars. People only know if they see it or are told.</li>
          <li><b>16:52</b> — the city issues an official flash-flood warning to everyone.</li>
          <li>Residents whose front door is under water stay indoors; someone gets cut off and needs help.</li>
          <li><b>17:35</b> — the rain eases and the water drains away; each street reopens as soon as it is dry (all clear around 18:15).</li>
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
        <Row k="“3 inside”">How many people are inside the clinic or the shelter. The clinic shows “✚ 2 treating · 1 waiting” when it has patients.</Row>
        <Row k={<span style={{ color: '#d94f86' }}>Pink plaster</span>}>Injured (minor). Injured people walk more slowly until treated at the clinic.</Row>
        <Row k={<span style={{ color: '#e9b824' }}>Yellow rings / yellow !</span>}>Someone just passed on a warning (rings), and the people who just heard it (yellow !).</Row>
        <Row k={<span style={{ color: '#ff5c8a' }}>Pink heart</span>}>Two members of a household found each other.</Row>
        <Row k={<span style={{ color: '#4f9d63' }}>Green shield</span>}>A safety rule moved or kept this person safe — not a JEV decision.</Row>
        <Row k="Red-and-white tape">Fire cordon around the office — closed to people and cars.</Row>
        <Row k="Dark blue water">Deep floodwater — closed to everyone. Light blue = shallow (people wade slowly; cars can’t pass). Striped barriers block flooded roads.</Row>
        <Row k="Bunting, stalls & stage">The street festival. Its road barricades close the plaza road to cars.</Row>
        <Row k="Coral dashed ring + cones">Closed area after the meteor — impassable for people and cars.</Row>
        <H>Buildings</H>
        <Row k="Red cross roof">Clinic — healthcare workers report here; glows when on generator power.</Row>
        <Row k="Teal roof, shield">Community shelter.</Row>
        <Row k="Striped awning">Market hall (coral) and corner store (yellow).</Row>
        <Row k="Red, garage doors">Fire &amp; rescue station — responders’ base.</Row>
        <Row k="Lightning bolt">Power substation — where the blackout starts. During an outage it gets an orange-and-white fenced repair area with a progress bar.</Row>
        <Row k="Tall glass tower">Office — many commuters work here.</Row>
        <H>People</H>
        <Row k="White outfit, teal cross">Healthcare worker (nurse, doctor).</Row>
        <Row k="Red outfit, yellow stripe & helmet">Responder (firefighter, paramedic).</Row>
        <Row k="Apron">Service worker (vendor, shopkeeper, barista).</Row>
        <Row k="Orange vest, white hat">Meteor cleanup crew (scenery, not a citizen).</Row>
        <Row k="Purple stage, instruments">Festival performers (scenery, not citizens).</Row>
        <Row k="Grey-toned figures">Out-of-town festival visitors — background scenery so the plaza isn’t empty. They aren’t citizens, can’t be clicked and never appear in any count.</Row>
        <Row k="Red truck, flashing lights">The fire engine — driven by the simulation on a fixed route, not by JEV.</Row>
        <Row k="Yellow vest, blue hard hat">Utility worker (a citizen who can choose to restore power).</Row>
        <Row k="Yellow van, amber beacons">A utility worker driving to the substation (they’re inside).</Row>
        <Row k="Orange truck, ladder">The backup utility crew (scenery, dispatched by the simulation).</Row>
        <Row k="Responder waving a glowing wand">Directing traffic at a dark intersection — that junction’s signal heads stay dark while they work.</Row>
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
        <P>Schema-valid answers aren’t automatically <i>good</i> answers. Whether JEV decides <b>well</b> is a separate question this demo does not measure — judge for yourself by opening the inspector.</P>
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
        <Row k="Why didn’t everyone react to the fire at once?">Fires and floods are local. A citizen only knows about one if they saw it, got the official alert, or a neighbor chose to warn them. JEV is only ever told what that citizen could actually know.</Row>
        <Row k="Someone went to check on family but nobody was there">They only knew where their housemate <i>said</i> they’d be. If that person moved on, the search fails — the simulation never gives anyone magical knowledge.</Row>
        <Row k="Why didn’t the power come back at a fixed time?">There is no timer. The lights return only when the repair work at the substation is finished — by utility staff who chose to go, or by the backup crew.</Row>
        <Row k="Why did the van take so long?">It drives through the same deterministic traffic as everyone else — dark signals become all-way stops and queues build. A responder directing a junction on its route can speed it up.</Row>
        <Row k="Why does the fire go out at different times?">How fast it’s put out depends on how many responders <i>chose</i> to report for duty and are standing at the crew post — a real consequence of their decisions.</Row>
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
        <Row k="Safety rule">Deterministic code that moves people out of closed or immediately dangerous spots, or acts when only one safe option exists. Always labeled.</Row>
        <Row k="Alert source">How a citizen knows about the emergency: saw it, official alert, or warned by a named neighbor.</Row>
        <Row k="Household">People who share a home. Each knows where the others last said they’d be.</Row>
        <Row k="Work order">The repair job the outage creates: 240 units of work at the substation, done by whoever is physically on site.</Row>
        <Row k="Backup crew">A scheduled, labeled fallback so power always returns eventually — but only by driving there and doing the work.</Row>
        <Row k="All-way stop">What cars do at a dark signal: stop, then go one at a time. A responder directing traffic replaces it with hand signals.</Row>
        <Row k="Clinic beds">Two beds, plus one for each nurse or doctor who chose to report for duty and is inside.</Row>
      </>
    ),
  },
];
