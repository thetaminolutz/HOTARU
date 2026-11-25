/**
 * Dialogue (SPEC §16–17): short, gentle lines chosen by conditions — who is speaking (job,
 * personality, age), how well they know you (a polite first meeting, later a wave, eventually a
 * nickname), the hour, weather, season and place — plus gossip about their neighbours.
 * A talk is a greeting and one or two topical lines. Pure: (context, rng) → lines.
 */
import type { Rng } from '../core/rng';
import type { Job, Personality, Age } from './data/people';

export type TalkCtx = {
  name: string; job: Job; personality: Personality; age: Age;
  met: number; nick: string; hour: number;
  season: 'spring' | 'summer' | 'autumn' | 'winter';
  weather: 'fair' | 'rain' | 'snow' | 'storm' | 'fog';
  village: string; friend: string; wanderer?: string;
};

type L = string;
const fill = (s: string, c: TalkCtx) => s.replace(/\{name\}/g, c.name).replace(/\{village\}/g, c.village).replace(/\{friend\}/g, c.friend).replace(/\{nick\}/g, c.nick);

export const GREET_FIRST: Record<Personality, L[]> = {
  shy: ['Oh! H-hello. I’m {name}.', '...Welcome to {village}. I’m {name}.', 'A traveller? Please, mind the step. I’m {name}.', 'Ah—good day. Forgive me, I don’t see many new faces.'],
  cheerful: ['Welcome, welcome! I’m {name}. First time in {village}?', 'A new face! How lovely. I’m {name}!', 'Hello there! The tea is warm and the people are kind here.', 'Oh, hello! You picked a fine day to wander.'],
  grumpy: ['Hm. A traveller. I’m {name}. Don’t trample the moss.', '...You’re new. Fine. I’m {name}.', 'Mind the lanterns. They took Akari days.', 'Hmph. Welcome, I suppose.'],
  dreamy: ['Did the wind bring you? I’m {name}.', 'Oh—I thought you were a cloud passing. I’m {name}.', 'Welcome. The light is very soft today, isn’t it?', 'You walk like someone listening for something.'],
  chatty: ['Well now! A visitor! I’m {name}, I know everyone and everything in {village}.', 'Hello, hello! Where did you come from? Never mind, sit, sit!', 'Ah, you must be the traveller everyone’s whispering about!', 'Welcome! Have you met {friend} yet? You must.'],
};

export const GREET_AGAIN: Record<Personality, L[]> = {
  shy: ['Oh, it’s you again. Hello.', '...Hello. I’m glad you came back.', 'Good day. Are you well?'],
  cheerful: ['There you are! Good to see you!', 'Back again! The village missed you.', 'Hello again, friend!'],
  grumpy: ['You again. ...Good.', 'Hm. Still wandering, are you.', 'Ah. It’s you. Sit, if you must.'],
  dreamy: ['You came back, like the tide.', 'I dreamt of lanterns last night. Then you came.', 'Hello again. The sky looks different every time you visit.'],
  chatty: ['You’re back! I’ve so much to tell you!', 'Ah, perfect timing, I was just thinking of you!', 'Hello again! Did you hear the news?'],
};

export const GREET_FRIEND: L[] = ['{nick}! Come, come.', 'Ah, {nick}. You always appear at the right moment.', 'Welcome home, {nick}.', '{nick}! I saved you a cup of tea.', 'There’s our {nick}!', 'Good to see you, {nick}.'];

export const TIME_LINES: Record<'dawn' | 'day' | 'dusk' | 'night', L[]> = {
  dawn: ['Up with the herons, are you?', 'The mist hasn’t lifted yet. Lovely, isn’t it?', 'Morning comes slowly here. That’s how we like it.', 'The bell hasn’t even rung yet.', 'Listen—the warblers are practising.', 'Early light is the best light for walking.'],
  day: ['A good day for walking far.', 'The afternoon is long and kind today.', 'Have you eaten? There’s rice at the tea house.', 'The sun is high. Rest under a tree for a while.', 'Even the cats are napping.', 'A day like this makes the work feel light.'],
  dusk: ['The lanterns will be lit soon.', 'Golden hour. Everything looks like a painting.', 'Akari will be coming round with her taper.', 'The lake turns to a mirror at this hour.', 'Supper smells are drifting down the street.', 'Sit somewhere high and watch the sun go.'],
  night: ['Out late? The fireflies keep you company, I suppose.', 'Mind the path; follow the lanterns.', 'The stars are very close tonight.', 'Everyone’s asleep but the owls and you.', 'Night in {village} is quiet as snow.', 'Walk softly. The houses are dreaming.'],
};

export const WEATHER_LINES: Record<TalkCtx['weather'], L[]> = {
  fair: ['Not a cloud worth mentioning.', 'Fine weather for drying laundry.', 'The wind is in a good mood today.', 'Clear skies. The mountains look close enough to touch.', 'A gentle day. Enjoy it.', 'Perfect weather for doing nothing at all.'],
  rain: ['Come under the eaves, you’ll catch a chill.', 'The rain is good for the rice.', 'Listen to it on the roof. Better than music.', 'The frogs will sing tonight.', 'Rain makes the moss so bright.', 'Do you have an umbrella? Take this one—no, I insist. ...Oh, you have one.'],
  snow: ['Snow! The whole world goes quiet.', 'Mind your step, the bridge is slippery.', 'The onsen will be lovely tonight.', 'My breath makes little clouds. Like a dragon.', 'The camellias look brave in the snow.', 'Footprints everywhere. Who walks at night?'],
  storm: ['Better wait it out indoors.', 'Count after the flash. The thunder is far yet.', 'The old cedars have seen worse storms than this.', 'Sit by the hearth until it passes.', 'Storms always pass. Like everything.', 'Hear that? The mountain is grumbling.'],
  fog: ['The fog swallows the far shore.', 'Walk slowly. The paths move in fog, they say.', 'Fog like this hides foxes and secrets.', 'Everything sounds closer in fog.', 'The lanterns look like little moons in this mist.', 'I can’t even see the castle today.'],
};

export const SEASON_LINES: Record<TalkCtx['season'], L[]> = {
  spring: ['The cherries are out! Have you seen the hills?', 'The paddies are flooded; they mirror the sky.', 'The warblers have returned.', 'Spring makes everyone a little foolish.', 'Petals in my tea again.', 'The frogs are waking up.', 'We’ll fly the carp streamers soon.', 'Plum first, then cherry. Always in that order.', 'The mountain snow is melting into the river.', 'Everything smells green.'],
  summer: ['Cicadas! You can’t hear yourself think.', 'The fireflies will be thick by the reeds tonight.', 'Hot, hot. Have some cold barley tea.', 'The festival lanterns are being painted.', 'The rice is tall and green.', 'Wind chimes everywhere. My favourite sound.', 'Swim in the lake if it gets too hot.', 'Thunderstorms in the afternoons, sun by evening.', 'The sunflowers at Hanano are taller than me.', 'Summer nights are made for sitting outside.'],
  autumn: ['The maples are burning red up the mountain.', 'Harvest time. Every back in {village} is sore.', 'Persimmons drying under the eaves.', 'The pampas grass is silver this year.', 'Leaves everywhere. I sweep and they come back.', 'Mist in the mornings, gold in the evenings.', 'The harvest moon was enormous.', 'The crickets sing all night now.', 'Mushroom season! Don’t eat the red ones.', 'The ginkgo trees smell terrible and look wonderful.'],
  winter: ['Snow on the roofs. Time for the hearth.', 'The cranes are dancing on the marsh.', 'The lake ice is thin. Don’t walk on it.', 'Camellias bloom red when everything else sleeps.', 'Warm your hands, traveller.', 'The monkeys are in the hot spring again.', 'Long nights. More time for stories.', 'Snow lanterns along the path tonight.', 'Winter is quiet. You can hear the river under the ice.', 'Have some sweet sake. It’s cold.'],
};

export const JOB_LINES: Record<Job, L[]> = {
  farmer: ['The terraces don’t tend themselves.', 'My grandfather built these walls stone by stone.', 'Rice teaches patience.', 'The herons follow me along the furrows.', 'Every grain has a story, my mother said.', 'Mud up to my knees, sun on my back. Good work.', 'The water has to reach every terrace. That’s the trick.', 'A crow stole my lunch again.', 'If it rains tomorrow, I’ll mend the baskets.', 'The scarecrow is my best listener.', 'Plant, wait, hope. That’s farming.', 'Taste this rice. Last year’s. Still good.'],
  fisher: ['The lake gives what it gives.', 'Out before dawn with a lantern on the bow.', 'The old carp under the pier is older than me.', 'Fish jump at dusk. Nobody knows why.', 'Mending nets is like mending a story.', 'The mist on the water at five—you should see it.', 'Genzō taught me to read the ripples.', 'Some days I catch nothing. Those are good days too.', 'The cats know when I come home.', 'The wind shifts before the fish do.', 'There’s a shrine under the lake, they say.', 'Row slowly; the lake likes slow things.'],
  lanternMaker: ['Every lantern in {village} passed through my hands.', 'Paper, bamboo, a little glue and a lot of care.', 'At dusk I light them one by one. It’s my favourite hour.', 'A lantern is a small promise that someone will come home.', 'I paint the crest last, when my hand is warm.', 'The wind ate two of my lanterns last week.', 'Light shows you the path, but it’s you who walks it.', 'Akari’s lanterns glow warmer than mine. I don’t know her secret.', 'The bamboo has to dry a whole season.', 'Don’t touch—the paint is still wet!', 'I’ve never once forgotten a lantern.', 'Some nights the lanterns light the fireflies’ way.'],
  potter: ['Clay remembers every touch.', 'The kiln is my old friend.', 'This bowl cracked. I like it more now.', 'Mind the wheel, it bites.', 'The glaze is ash from the hearth.', 'Every cup is a little different. Like people.', 'I dig the clay by the river bend.', 'A bowl is mostly empty space. That’s what makes it useful.', 'The fire decides the colour. I just ask nicely.', 'Tea tastes better from a bowl you made.', 'My hands are never clean.', 'Throw, trim, wait, fire. Then hope.'],
  weaver: ['Click, clack, the loom keeps time.', 'Indigo from our own garden.', 'A thread at a time, a life at a time.', 'This pattern is my grandmother’s.', 'The colours change with the seasons.', 'Weaving is mostly counting and dreaming.', 'I’m making a haori for the festival.', 'Cotton in summer, silk for weddings.', 'The cat sleeps on the finished cloth. Always.', 'One wrong thread and you start the row again.', 'Blue hands, see? From the dye.', 'Every knot holds the next.'],
  carpenter: ['Good wood sings when you plane it.', 'No nails. Just joints that fit.', 'This beam is older than the village.', 'Measure twice, cut once, apologise to the tree.', 'Cedar for the walls, cypress for the bath.', 'The roof leaks? I’ll be there tomorrow.', 'I built that bridge over the stream.', 'Wood moves with the seasons. You have to let it.', 'Smell that? Fresh hinoki.', 'My saw is older than my son.', 'A good joint lasts three hundred years.', 'The shrine gate needs new paint soon.'],
  merchant: ['Best prices in {village}! ...Well, the only prices.', 'Tea, rice, needles, dreams. What do you need?', 'Business is slow, but the gossip is excellent.', 'The peddler undercuts me every spring.', 'Come back when you have something to trade.', 'I keep the abacus warm.', 'The noren goes up at seven, down at six.', 'Everything here was carried on someone’s back.', 'Fresh persimmons! Well, fairly fresh.', 'I remember every customer’s favourite.', 'A shop is a place for news as much as goods.', 'Pay me in stories if you like. Good ones.'],
  innkeeper: ['A room, a bath, a quiet night. That’s all an inn needs.', 'The futons are aired every morning.', 'Travellers bring the world to {village}.', 'Mind the steps, they’re freshly swept.', 'The hot water is the best in the valley.', 'I’ve housed poets and pilgrims and once a very lost monk.', 'Leave your sandals by the door.', 'There’s always rice in the pot for a traveller.', 'The guest book has names from two hundred years ago.', 'Rest. The road will still be there tomorrow.', 'I hear everyone’s snoring. I know everything.', 'Dinner at seven. Bath before.'],
  tea: ['Sit. Tea first, talking after.', 'The water must just begin to sing.', 'These leaves come from Chabatake.', 'A cup of tea is a small rest you can hold.', 'Bitter first, then sweet. Like most things.', 'Watch the steam. It tells you when.', 'The best tea is the one you share.', 'I sweep the step every morning so the day starts clean.', 'Matcha for guests, barley tea for friends.', 'Try the sweet bean cake.', 'The bowl is warm. Hold it with both hands.', 'Stay as long as you like.'],
  monk: ['The bell rings at dawn and dusk. In between, I sweep.', 'Every leaf on the steps is a small lesson.', 'Sit quietly. Listen to what the place says.', 'The incense smoke shows the wind.', 'Breathe in the mountain, breathe out the worry.', 'The old cedar has been praying longer than I have.', 'Footsteps on the stair are prayers too.', 'There is no hurry in the mountain.', 'Leave a coin, take a fortune. Or just bow.', 'The bell’s voice reaches the lake on still evenings.', 'I chant for the fish in the lake too.', 'Have you rung the bell? Gently, please.'],
  child: ['Wanna play tag? You’re it!', 'I caught a beetle! A big one!', 'Mama says don’t go near the river. I go near the river.', 'The dragonflies are faster than me.', 'Do you have a kite? Grandpa Tako made me one.', 'I saw a white fox! Nobody believes me.', 'The cat had kittens under the storehouse!', 'Race you to the torii!', 'I’m hiding. Don’t tell anyone.', 'When I grow up I’ll make lanterns like Akari.', 'Shh! I’m listening for frogs.', 'Is it true you came from very far?'],
  elder: ['I’ve watched sixty autumns from this bench.', 'Sit with me. The young are always running.', 'Go is a game of patience. Do you play?', 'My knees can predict the rain.', 'When I was young the lake froze every winter.', 'The castle was full of light, long ago.', 'Feed the cats; they remember kindness.', 'Every season comes back. That’s the comfort.', 'I knew your face before you came. Funny, that.', 'Don’t hurry. Nothing good runs away.', 'The river sounds different every year.', 'Ah, my favourite part of the day.'],
};

export const MOOD_LINES: Record<Personality, L[]> = {
  shy: ['...', 'I like it here. It’s quiet.', 'Sorry, I’m not very good at talking.', 'The cats understand me.', 'Maybe we could watch the lake together sometime.', 'I wrote a poem. I won’t show anyone.', 'Thank you for listening.', 'I collect smooth stones. Is that strange?'],
  cheerful: ['Isn’t everything wonderful today?', 'I could dance! I won’t, but I could.', 'Smile! The lanterns are watching.', 'I made too many rice balls. Take one!', 'Today is my favourite day. I say that every day.', 'Let’s have a festival. Just us.', 'You make the street brighter.', 'Everything grows if you’re patient and kind.'],
  grumpy: ['Too much noise in summer, too much quiet in winter.', 'The young never fix anything.', 'Hmph. The tea is acceptable.', 'Don’t tell anyone I fed that cat.', 'If you see a crow with my sandal, it’s mine.', 'I suppose you’re not so bad.', 'Weather’s turning. My knee says so.', 'Hm. Thank you. ...For visiting.'],
  dreamy: ['Do you think the fish dream?', 'The clouds look like a story today.', 'I followed a dragonfly and forgot where I was going.', 'There’s a song in the river if you listen.', 'Sometimes the lanterns flicker like they’re talking.', 'I painted the moon. It didn’t look like the moon.', 'Where do the fireflies go in winter?', 'I think the mountain is listening.'],
  chatty: ['Did you hear? {friend} has a new cat!', 'Oh, and the peddler came by with silk from the coast!', 'Let me tell you about my nephew—no, wait, first the weather.', 'Everyone says the masked stranger is a fox. Everyone!', 'I talked to {friend} for three hours yesterday.', 'You know what I think? I think the old castle is lonely.', 'And another thing about the tea house…', 'Stay a while, I’m just getting started!'],
};

export const GOSSIP: L[] = [
  '{friend} has been humming all week. In love, I think.',
  'Have you met {friend}? A good heart, a terrible cook.',
  '{friend} says the white fox was at the shrine again.',
  'Don’t tell {friend}, but I’m knitting them a scarf.',
  '{friend} lost a sandal in the river. Again.',
  'They say {friend} saw lights on the castle mountain.',
  '{friend} makes the best rice balls in {village}.',
  '{friend} and I used to race to the torii as children.',
  'If you see {friend}, tell them the tea is ready.',
  '{friend} can name every star. Every single one.',
  '{friend} found a stone shaped like a frog. Very proud.',
  'Poor {friend}. The crows took the persimmons.',
  '{friend} is saving up for a boat.',
  '{friend} writes letters to someone across the lake.',
  'Ask {friend} about the night the lanterns went blue.',
  '{friend} snores like a temple bell.',
  '{friend} planted plum trees for each of their children.',
  'I think {friend} is the one leaving flowers at the little shrine.',
  '{friend} once followed a firefly all the way to the waterfall.',
  'The postman says {friend} gets more letters than anyone.',
  '{friend} is teaching the children to fold paper cranes.',
  'Don’t play go with {friend}. You won’t win.',
  '{friend} swears the masked stranger bowed to them.',
  '{friend} hums when they’re worried. Listen for it.',
  '{friend} made a lantern shaped like a cat.',
];

export const NICKNAMES = ['Wanderer', 'Lantern-chaser', 'Quiet Feet', 'Tea Friend', 'Little Heron', 'Firefly', 'Cloud-watcher', 'Bridge-crosser', 'Moon-walker', 'Leaf-catcher', 'Kind Stranger', 'Road-friend'];

/** Wanderers have their own voice (SPEC §17). */
export const WANDERER_LINES: Record<string, L[]> = {
  poet: ['Old pond—no, that one is taken. Let me think.', 'A view like this deserves seventeen syllables.', 'Lanterns on water / each one a small, warm promise / the dark keeps for us.', 'Trade me a haiku and I’ll trade you one.', 'I go where the view is best. Today, here.', 'Words are lanterns too.', 'Have you ever counted the syllables of rain?', 'Write it down before it flies.'],
  pilgrim: ['Thirty-three shrines, and the road between them.', '*ring* Forgive the bell. It keeps me walking.', 'Walk with me a while, if you like.', 'At each shrine I leave a stamp. At the end, a book.', 'The road is the prayer.', 'My sandals have worn through four times.', 'Kumoji’s steps are the hardest and the kindest.', 'Bow at the torii. It notices.'],
  peddler: ['Everything a traveller needs, and three things they don’t!', 'Rumour for rumour? Fine. They say a shrine sleeps under the lake.', 'This pack is heavier than me.', 'Keepsakes, trinkets, the occasional mystery.', 'I hear the castle bell rang by itself once.', 'Trade? I like shells and strange stones.', 'From the coast, the finest needles. From me, the finest prices.', 'Follow the river and you’ll find something. Rivers always lead somewhere.'],
  painter: ['Hold still—no, not you, the light.', 'I paint places people haven’t found yet.', 'This one? A waterfall nobody visits. I won’t say where.', 'Blue for distance, warm for nearness.', 'The mist is the hardest thing to paint.', 'Look at this painting. Recognise it? Then go there.', 'Every hour has its own colour.', 'Sit by me. Watch the light change.'],
  oldFisher: ['I know every fish in this lake by name.', 'The big carp? Forty years old if a day.', 'There’s a shrine under the water. I’ve seen its roof on still mornings.', 'Want to learn to fish? Patience first. Hooks later.', 'The lake is a mirror at dusk. Don’t ripple it.', 'Akari’s mother lit the first lanterns on this pier.', 'Fish bite at dawn and dusk. Like me.', 'Sit. Watch the float. That’s the whole secret.'],
  akari: ['Every lantern on this lake is mine. Well, ours.', 'At dusk I light them one by one. Come walk with me.', 'You’ll want a lantern of your own someday.', 'Paper, bamboo, and a little bit of heart.', 'The fireflies like my lanterns. Or I like to think so.', 'My mother taught me to light them in the right order.', 'The strings sway when the wind talks.', 'Welcome to Tomoshibi, traveller.'],
  masked: ['...', '...(The stranger bows, very slightly.)', '...(A small folded paper crane is left on the post.)', '...(The fox mask tilts, as if listening.)', '...(They point toward the castle.)', '...(A faint smile behind the mask?)', '...(They step back into the dusk.)', '...'],
  lostCat: ['Have you seen my cat? She’s orange with a white tail.', 'Her name is Mikan. Like a tangerine.', 'She always comes back. But it’s been three days.', 'Maybe she went to the storehouse? Or the shrine?', 'I left fish out for her.', 'If you find her, be gentle. She’s shy.', 'Mama says cats go on adventures.', 'Thank you for looking!'],
  hermit: ['The waterfall has been speaking for a thousand years.', 'Listen. It’s a melody, not noise.', 'I can teach you a flute song, if you’re patient.', 'Leave the world at the bottom of the path.', 'Mist on the face is the best medicine.', 'The rainbow comes at three, on sunny days.', 'Sit on the flat stone. It’s warm.', 'Few find this place. Fewer stay.'],
  starWatcher: ['Look—the Weaver Star and the Herdsman.', 'There’s a star missing from my chart. A stone fell, they say.', 'The best stars are on this hill after midnight.', 'Every constellation is a story someone needed.', 'Lie down in the grass. The sky gets closer.', 'Shooting star! Make a wish, quickly.', 'The moon is a lantern somebody forgot to put out.', 'Come back on a clear night. I’ll show you the river of heaven.'],
  postman: ['Letters for Inaho, Chabatake, and a parcel for Ichiba!', 'No timers, no hurry. Letters arrive when they arrive.', 'Could you carry this to {village}? Whenever you pass.', 'I know every gate and every dog on the road.', 'Rain or snow, the letters must travel.', 'Someone at the coast writes to someone at the lake. Every week.', 'My legs are the fastest thing in the valley.', 'Fine day for walking!'],
  musician: ['A song for a coin, or a coin for a song?', 'The shamisen hates the damp.', 'I play at the tea houses. Sometimes at the onsen.', 'Every village has its own song. I collect them.', 'Hum with me. You know this one.', 'The wind chimes are my rivals.', 'Music is just sound that someone loved.', 'Come to the festival. I’ll be playing all night.'],
  botanist: ['Look—a bellflower out of season!', 'I’m pressing one of every flower in the valley.', 'The moss here is older than the castle.', 'Lichen tells you how clean the air is. Very clean.', 'Have you seen the hydrangeas on Ajisaiyama? Blue as the sea.', 'Don’t pick the spider lilies; they belong to the dead.', 'Each region has a plant found nowhere else.', 'My notebook is heavier than my pack.'],
  kiteMaker: ['The wind is perfect for kites today.', 'I make a kite for every child in Inaho.', 'Hold the string loosely. Let it pull.', 'A kite is a wish on a long string.', 'Up! Up! There she goes!', 'The best wind comes off the terraces in the afternoon.', 'I lost one kite to the castle tower. It’s still there.', 'You fly it, I’ll watch.'],
  teaMerchant: ['First flush from Chabatake. Smell it.', 'Tea from the slopes, carried to every village.', 'The best leaves are picked at dawn.', 'Would you like to try a little?', 'Green, roasted, smoky—which mood are you in?', 'The tea house in Ichiba buys half my harvest.', 'Steep it short. People always steep it too long.', 'A cup for the road?'],
  ferryman: ['Across the bay? Another day, the boat’s resting.', 'I’ve rowed this bay ten thousand times.', 'The gulls follow me for scraps.', 'Sea fog in the morning, clear by noon.', 'The island has a lighthouse nobody tends.', 'Watch the waves break white on the rocks.', 'Salt in the air keeps you young.', 'Sit in the boat if you like. It’s good for thinking.'],
};

const pick = <T>(r: Rng, a: T[]): T => a[r.int(0, a.length)]!;

export const VILLAGE_LINES: Record<string, L[]> = {
  Ichiba: ['Ichiba sits at the crossroads. Everything passes through.', 'Market day is every fifth day. Today? Maybe.', 'The tea house by the well has the best view of the street.', 'Six roads meet here, if you count the river.', 'Our potter\u2019s bowls go all the way to the coast.', 'The lantern strings over the street are lovely at dusk.'],
  Inaho: ['The terraces climb all the way to the sky.', 'Every house in Inaho has a thatched roof older than its owner.', 'The storehouse holds rice for three winters.', 'Children fly kites from the top terrace.', 'Water runs down the terraces like stairs.', 'The shrine at the end of the road guards the harvest.'],
  Chabatake: ['Chabatake means tea fields. Not very imaginative.', 'The rows follow the hills like combed hair.', 'The tea is picked by hand at dawn.', 'Smell the roasting from the long house.', 'Mist is good for tea. We have plenty.', 'Our tea goes to Ichiba and the temple.'],
  Shiomachi: ['Salt, nets and gulls. That\u2019s Shiomachi.', 'The boats go out before the sun.', 'The ferryman knows every rock in the bay.', 'Sea fog rolls in like a slow wave.', 'The cats here are fat and proud.', 'From the cliff you can see the gull island.'],
  Sakuraoka: ['In spring the whole hill turns pink.', 'People come from every village for the blossoms.', 'Sakuraoka is a hill of tea houses and old cherry trees.', 'The oldest cherry here is said to be three hundred years old.', 'In autumn the cherry leaves go copper.', 'Sit under a tree and nobody will hurry you.'],
  Yukemuri: ['Yukemuri means hot-spring steam. You see why.', 'The monkeys bathe in the upper spring.', 'Snow and steam, that\u2019s winter here.', 'The inn has a bath under the stars.', 'The pass is closed some winters. We don\u2019t mind.', 'Soak until your worries melt.'],
  Kumoji: ['Kumoji is the path to the clouds.', 'The cedars here are taller than the temple.', 'The deer bow if you bow first.', 'Ring the bell gently; it carries far.', 'The steps are counted: one hundred and eight.', 'Copper roofs go green with age, like moss.'],
  Tomoshibi: ['Tomoshibi means lamplight. For the lanterns, of course.', 'The pier has been here longer than anyone remembers.', 'Every evening the lake fills with golden reflections.', 'The boathouse window is lit every night.', 'Akari\u2019s family has lit these lanterns for generations.', 'Fireflies gather by the reeds in summer.'],
};

/** A talk: a greeting and one or two topical lines. */
export function talk(c: TalkCtx, r: Rng): string[] {
  const out: string[] = [];
  if (c.wanderer) {
    const lines = WANDERER_LINES[c.wanderer] ?? [];
    out.push(fill(pick(r, lines), c));
    if (c.wanderer !== 'masked' && r.next() < 0.6) out.push(fill(pick(r, lines.filter((l) => l !== out[0])), c));
    return out;
  }
  if (c.met === 0) out.push(fill(pick(r, GREET_FIRST[c.personality]), c));
  else if (c.met >= 5) out.push(fill(pick(r, GREET_FRIEND), c));
  else out.push(fill(pick(r, GREET_AGAIN[c.personality]), c));
  const tod = c.hour < 7 && c.hour >= 4 ? 'dawn' : c.hour < 17 ? 'day' : c.hour < 20 ? 'dusk' : 'night';
  const pools: [L[], number][] = [
    [JOB_LINES[c.job], 3], [MOOD_LINES[c.personality], 2], [SEASON_LINES[c.season], 2],
    [WEATHER_LINES[c.weather], c.weather === 'fair' ? 1 : 3], [TIME_LINES[c.hour < 4 ? 'night' : tod], 1.5], [GOSSIP, c.met > 0 ? 1.5 : 0.3],
    [VILLAGE_LINES[c.village] ?? [], VILLAGE_LINES[c.village] ? 1.2 : 0],
  ];
  const tot = pools.reduce((a, [, w]) => a + w, 0);
  const n = c.personality === 'chatty' ? 2 : c.personality === 'shy' ? 1 : r.next() < 0.5 ? 2 : 1;
  for (let k = 0; k < n; k++) {
    let u = r.next() * tot;
    for (const [pool, w] of pools) { u -= w; if (u <= 0) { const line = fill(pick(r, pool), c); if (!out.includes(line)) out.push(line); break; } }
  }
  return out;
}

/** Every line in the bank (for counting / tests). */
export function allLines(): string[] {
  return [
    ...Object.values(GREET_FIRST).flat(), ...Object.values(GREET_AGAIN).flat(), ...GREET_FRIEND,
    ...Object.values(TIME_LINES).flat(), ...Object.values(WEATHER_LINES).flat(), ...Object.values(SEASON_LINES).flat(),
    ...Object.values(JOB_LINES).flat(), ...Object.values(MOOD_LINES).flat(), ...GOSSIP, ...Object.values(WANDERER_LINES).flat(), ...Object.values(VILLAGE_LINES).flat(),
  ];
}
