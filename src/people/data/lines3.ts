/**
 * More dialogue (SPEC §18), part 3: memory (people notice where you've been), rumours that hint
 * at secrets in each region, festival talk, and the world after the story's ending.
 */
type L = string;

/** "You were at …, weren't you?" — keyed by the region you visited recently. */
export const MEMORY: Record<string, L[]> = {
  castle: ['You were up at the old castle, weren’t you? Your sandals have that red dust.', 'Did you climb the keep? People say the view goes all the way to the sea.', 'You smell of old cedar and moss. The castle, I’d guess.', 'Was it quiet up at Kagejō? It’s always quiet up there. A listening kind of quiet.', 'Did the castle say anything to you? It never says much to me.'],
  temple: ['You’ve been to Kumoji! All those steps — your legs must be singing.', 'Did you ring the bell at the temple? I think I heard it.', 'You have incense in your hair. The temple, yes?', 'The monks up there are kind. Did they give you tea?', 'Did you see the pagoda in the clouds? It floats on misty days.'],
  coast: ['You smell of the sea. Shiomachi?', 'Did you see the boats in the harbour? My cousin has the blue one.', 'Salt on your sleeves! Been down to the coast, have you?', 'Were the gulls rude to you? They’re rude to everyone. Don’t take it personally.', 'The sea caves at low tide — did you find them?'],
  snow: ['You’ve come from the snowy pass! Your cheeks are still pink.', 'Did you soak in the onsen at Yukemuri? You look softer.', 'The snow monkeys — did you see them in the hot spring? Little old men in a bath.', 'You must be cold to the bone. Come closer to the fire.', 'They say there’s an ice cave up there, blue as a dream.'],
  cedar: ['You were in the cedar forest. You have that quiet look.', 'Did the big trees speak to you? They spoke to my grandmother.', 'Kirisugi is so misty. Did you get lost? Everyone gets a little lost there.', 'People say they’ve seen something huge in the cedars at dawn. A deer, or a mountain walking.', 'You have moss on your shoulder. The cedars like you.'],
  bamboo: ['You walked through the bamboo, didn’t you? The green stays in your eyes.', 'Did you hear the bamboo knock in the wind? Like a forest full of wooden bells.', 'There’s a clearing in the bamboo where the wind stops. Did you find it?', 'Bamboo grows so fast you can almost hear it. Did you listen?'],
  maple: ['You’ve been to Momijiyama! Did the red leaves fall on you?', 'The maple mountains are on fire this time of year. Beautiful fire.', 'You have a red leaf stuck in your hair. Keep it, it suits you.', 'The deer up in the maples are very polite. Did they bow?'],
  rice: ['Back from Inaho? The terraces look like stairs to the sky.', 'You have mud on your knees. The rice fields welcomed you, I see.', 'Did you see the scarecrow on the top terrace? He points somewhere. Nobody knows where.', 'Did the frogs sing for you in the paddies?'],
  market: ['You’ve been to Ichiba market! Did you try the grilled rice cakes?', 'The market is so noisy. Your ears must be tired. Rest here.', 'Did you buy anything? Show me! Show me!', 'The peddler at Ichiba sells the best combs. And the worst jokes.'],
  tea: ['You smell of green tea. The slopes of Chabatake?', 'Did you see the tea pickers? Their hands are so fast.', 'The tea rows look like a green comb on the hill, don’t they?', 'Chabatake tea is the best. Don’t tell the market people I said so.'],
  cherry: ['Sakuraoka! Were the blossoms out?', 'You have a petal on your collar. The cherry hills, I think.', 'There’s an old cherry tree up there older than the castle.', 'Did you nap under a cherry tree? Everyone does. It’s allowed.'],
  marsh: ['You went to the reed marsh? Did you see the cranes dance?', 'The marsh frogs sing out of tune. It’s charming, if you’re in the mood.', 'Your boots are wet to the knees. Ashihara, I’d bet.', 'The reeds whisper so much. I always wonder what they’re saying.'],
  lake: ['You were out on the lake. I saw a little boat — was that you?', 'Did you visit the island? There’s a tiny shrine there.', 'The lake was so still this morning. Like a sheet of glass.', 'Did you see the old carp under the pier? He’s the lake’s mayor.'],
  volcano: ['You went up the volcano? Brave. It’s only sleeping, you know.', 'There’s a hot smell on you. Sulphur. Hinoyama?', 'The crater shrine is the loneliest shrine in the valley. Did you leave something there?'],
  ginkgo: ['The ginkgo plateau! Was it gold? It’s gold for one week only.', 'You smell a bit of ginkgo nuts. Sorry, it’s true.', 'The ginkgo trees are older than the oldest stories.'],
  mirror: ['You found the mirror lakes? Some say one reflects a different sky.', 'The mirror lakes are so high up. Did the clouds walk past you?', 'People say if you look into the mirror lakes long enough, you see another season.'],
};

/** Hints at secrets, by region (rumours people pass on). */
export const RUMOURS: Record<string, L[]> = {
  lake: ['They say a shrine sleeps under the lake. On still mornings you can see its roof.', 'There’s a tiny shrine on the island. The lake brings it offerings, one leaf at a time.', 'If you sit at the end of the pier at dusk, the whole lake turns gold.', 'The lantern spirits come out over the lake some nights. Follow them, they say.'],
  castle: ['There’s a garden behind the castle’s north wall. Nobody has seen the gate in years.', 'Writing appears on the castle wall by moonlight. My uncle swears it.', 'Somebody hears laughter in the castle courtyard at dusk. Kind laughter.', 'The castle keep has a balcony. From there you can see the whole lake.'],
  temple: ['When snow falls on the temple, the bell rings once by itself.', 'A fox wedding happens at the shrine when it rains in sunshine. Don’t stare!', 'The temple stairs have seventy steps. Or seventy-one, if you count the last one twice.', 'There’s a shrine on the very highest peak. Three stones and the wind.'],
  cedar: ['There’s a door in one of the giant cedars. Knock, and the tree knocks back.', 'In the cedar forest, if you stand very still, the little tree spirits come out.', 'At dawn, something huge walks in the cedar mist. Never close. Never unkind.'],
  bamboo: ['Deep in the bamboo, there’s a circle where even the wind walks around.', 'The bamboo spirits are shy. Be still and they might peek out.', 'Someone hid a shrine in the bamboo circle. It’s very, very quiet.'],
  maple: ['There’s a shrine inside an old tree on the maple mountain.', 'The deer of Momijiyama bow if you bow first.', 'A valley up in the maples is always autumn. Always.'],
  rice: ['The scarecrow on the top terrace points somewhere. Follow his arm.', 'There’s a well near Inaho. Look down it. Something looks back. Politely.', 'At tsukimi, the whole village sits on the hill above the fields.'],
  coast: ['There’s a cave by the sea you can only enter at low tide.', 'Gull island has a shrine. The offerings are feathers.', 'Sometimes a whale comes into the bay. Lucky, if you see it.', 'The ferry goes from Shiomachi to the lake every couple of hours.'],
  snow: ['Behind the onsen town, there’s a cave of blue ice with a little shrine inside.', 'On clear winter nights, ribbons of light dance in the north sky.', 'In winter they light hundreds of snow lanterns in Yukemuri.'],
  waterfall: ['There’s a cave behind the great waterfall. A candle burns there that nobody lit.', 'The hermit by the waterfall plays a melody the water taught him.', 'If you play the flute near the waterfall, it hums back.'],
  marsh: ['The cranes dance in the marsh at dawn in winter.', 'The marsh shrine is on stilts. The frogs sing the evening sutra.'],
  cherry: ['The oldest cherry tree in Sakuraoka is where we hold hanami.', 'Under the old cherry there’s a shrine wearing a petal hat.'],
  tea: ['There’s a shrine among the tea rows. They leave the first leaves there.'],
  ginkgo: ['On the ginkgo plateau, the leaves pay what we cannot, they say.'],
  mirror: ['One of the mirror lakes reflects a sky from another season.'],
  volcano: ['The crater rim has a shrine. The mountain breathes warm underneath it.'],
  wisteria: ['In the wisteria gorge there’s a shrine behind purple curtains.'],
  hydrangea: ['The hydrangea hill is bluest after the rain. Bring an umbrella.'],
  pampas: ['On the pampas moor the grass bows all one way, toward somebody.'],
  sunflower: ['The sunflowers face east, waiting. Some say they point to a buried box.'],
};

/** Festival talk: in the days before and on the day. */
export const FESTIVAL_TALK: Record<string, L[]> = {
  hanami: ['Hanami! Sit, sit. There’s room on the blanket.', 'The petals fall into your sake cup. That’s good luck.', 'Everybody sings at hanami. Even the grumpy ones. Especially the grumpy ones.', 'Look up. Now look up more. That’s hanami.', 'Grandmother says the old cherry is three hundred years old and still showing off.', 'I brought rice balls. Too many rice balls. Have some.', 'At night the lanterns in the branches make the blossoms glow pink.', 'Somebody fell asleep under the tree. It’s tradition.'],
  tanabata: ['The Lantern Festival! Get a lantern, write a wish, let it float!', 'The taiko starts at dusk. You’ll feel it in your chest.', 'Try the grilled squid. Then the shaved ice. Then the squid again.', 'The dance goes round and round the yagura. Just copy whoever is in front of you.', 'When the lanterns float out, everyone goes quiet. You’ll see.', 'The fireworks reflect in the lake. Twice the fireworks, half the price.', 'Even the fireflies come to the festival. They don’t need lanterns.', 'They say tonight the lanterns guide someone home. Every year.'],
  tsukimi: ['Look at the moon. That’s all. That’s the festival.', 'Have a dumpling. The rabbit in the moon made them.', 'Pampas grass for the harvest spirits. They like the swaying.', 'A full moon over a full harvest. We are lucky people.', 'My grandfather wrote a poem every tsukimi. I write half of one.', 'The moon looks bigger tonight. It knows people are looking.'],
  yukitoro: ['Hundreds of snow lanterns! The children made the crooked ones.', 'Warm amazake for the cold hands. Here.', 'The snow lanterns make the town look like the sky fell down softly.', 'Walk slowly. Every lantern has a little candle and a little wish.', 'Quiet music, warm drinks, cold noses. Perfect.'],
  newYear: ['The bells are ringing! One hundred and eight, one for each worry.', 'Happy New Year! May your year be gentle.', 'Stay up for the first sunrise. It’s the most hopeful one.', 'I’m counting the bells. I lost count at forty. Again.', 'The first sunrise of the year comes up over the sea of clouds.'],
};

/** After the story's ending: the world remembers. */
export const AFTER_ENDING: L[] = [
  'Did you see? The lake had more fireflies than anyone can remember.',
  'The lanterns feel different now. Lighter. Like they’re happy.',
  'My grandmother cried at the festival. She said, “She’s home.” Who is home?',
  'The garden at the castle is blooming. After all these years!',
  'Somebody saw the masked stranger without the mask. They said he was smiling.',
  'We still light the lanterns every night. But now it feels like a celebration.',
  'Akari says she’ll paint a firefly on every lantern from now on.',
  'The children made up a new song. It’s about a girl walking home on the light.',
  'I slept so well last night. Like something long unfinished got finished.',
  'The lantern spirits come out every night now. They seem cheerful.',
  'Haruto, the lantern keeper, laughs now. I didn’t know he could.',
  'The old story ends happily after all. I always hoped it would.',
];

/** Stories of Kagejō told by elders and the curious (the gentle mystery, §19). */
export const STORY_TALK: L[] = [
  'The young lord of Kagejō had a sister who loved the fireflies. That’s all my mother knew.',
  'They say the castle lanterns were lit every night for years, for someone who never came back.',
  'There was a festival, and mist, and a girl who followed the fireflies. Then the song stops.',
  'My great-grandfather was a lantern maker for the castle. He never spoke about the last summer.',
  'The masked stranger appears only at dusk. Always alone. Always looking at the lake.',
  'The stone tablets in the hills tell an old story. Find them all and you’ll know more than me.',
  'The fox mask at the castle — they say it belonged to someone who waited a very long time.',
  'Someone carved a song into a stone near the lake. “Firefly, firefly, carry my lantern home.”',
  'They say the thousandth lantern has a single firefly painted on it.',
  'The star watcher says one star fell into the lake the night she left.',
  'Nobody remembers who the lanterns are for. But we remember to light them.',
  'If the old story had an ending, I think it would be at the Lantern Festival.',
];
