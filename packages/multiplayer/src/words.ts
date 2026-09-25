/**
 * Room-name words (specs/2026-09-25-multiplayer/SPEC.md §4): short (3–6 letters), common,
 * inoffensive and easy to spell, with no homophones (including UK non-rhotic ones such as
 * sort/sought), no US/UK spelling variants and no accents, so a name heard aloud can be typed.
 * Three words give about 31 bits. Sorted; `names.test.ts` checks the rules.
 */
export const ROOM_WORDS: readonly string[] = `
able acorn acre active actor add advice agent agile aim airy album alcove alert alive alley almond
alpha alpine amber amble ample amused anchor angle ankle answer anthem apex apple apron apt arch
arctic arena arm aroma arrive art artful ashore ask aspen atlas atom attic autumn avid awake award
aware axis back bacon badge badger bag bagel bake baker ballet bamboo banana banjo bank banner
bark barn barrel basic basil basin basket bat batch bath bathe beacon bead beak beam bean beard
beaver bed beetle beg begin belt bench bend best big bike bingo bird bison bitter blade blank
blaze blazer blend bless blimp blink block bloom bluff blush boast boat bobcat bolt bone bongo
bonsai book boot bottle bounce bouncy bounty bowl box brainy branch brass brave breeze brew brick
bridge brief bright bring brisk broad bronze brook broom brunch brush bubble bubbly bucket buckle
bud bug bugle build bulb bumpy bundle bunny burger burst bus bush busy butter button buzz cabin
cable cactus cake call calm camel cameo camera camp canal canary candid candle candy canoe canvas
canyon cap cape car card cargo caring carol carpet carry cart carve cashew castle casual cat catch
cave cavern cedar celery chain chair chalk champ chart chase cheek cheer cheery cheese cherry
chess chest chew chewy chick chief chin chip chop chorus chunk cider cinder cinema circle circus
citrus city clam clap clay clean clear clever cliff climb cloak clock clog cloth cloud cloudy
clover clown club coach coast coat cobble cobweb cocoa code coffee coin cold collar comb comet
comfy comic condor cook cookie cool copper copy corn corner cosmic cosmos cotton couch count cove
cow coyote crab cradle craft crafty crane crate crater crawl crayon cream creamy crest crisp
crispy crow crown crumb crust cub cube cuckoo cuddle cuddly cup curly curry cute cycle dahlia
daily daisy damp dance dandy dapper dare dark dash date dawn deal deck deep delta den denim desk
dewy dial diary dig dime dine diner dingo dinner disc dish dive diver dock doctor dog doll dome
domino donkey doodle door double dove dragon drain drama draw dream dress drift drill drink drive
drop drum dry duck duet dune dusky dust dusty duvet eager eagle early earth earthy easel easy eat
echo edge edible egg elbow elf elk elm ember emblem empty emu encore engine enjoy enter epic equal
escape even exact fable fabric face falcon family famous fan fancy far farm fast feast feisty
feline fence fennel fern ferret fetch fiddle field fiery fiesta fig fill film finch fine finger
fire firm first fish fit fix fizzy flag flaky flame flap flash flask flat fleece fleet flint flip
float flock flood floor fluffy flurry flute fly foam fog foggy fold folk folksy follow fond fondue
forest forge fork form fossil fox frame fresh friend fringe frog frond frost frosty frozen fruit
fudge full funnel funny furry fuzzy gable gadget galaxy gallop game garden garlic gather gaze
gazebo gecko gem gentle gerbil geyser giant gift gifted giggle ginger give glad glade glass glen
glide glider globe glossy glove glow glue goat goblet gold golden golf good goose gorge gourd gown
grab grand grape graph grass grassy gravel gravy green greet grill grin grip grotto grove grow
guard guess guide guitar gum guppy gust habit hamlet hammer hand handy happy hardy harp hasty hat
hatch haven hawk hazel hazy head heart hearth hearty heavy hedge helmet help hen herb hero heron
hiccup hidden hike hill hilly hippo hive hobby holly honest honey hood hook hoop hop hopper hornet
hot hotel house hover hug huge hum humble hungry hurry hut ice icicle icy ideal igloo impala index
indigo ink inky inlet inner insect invent iris iron island ivory ivy jacket jade jaguar jar jazzy
jelly jersey jester jet jetty jigsaw jingle jockey jog jogger join joke jolly jug juggle juice
jumble jumbo jump jumper jumpy jungle just kayak kazoo kebab keen keep kelp kettle kind king
kingly kiosk kite kitten kiwi knee kneel knock koala label ladder ladle lake lamb lamp land lapel
laptop large lark laser lasso last latch late laugh launch lawn leaf leafy lean learn ledger left
lemon lemur lend lens lentil letter lever lid lift light like lilac lily lime linen liner lion
listen little live lively lizard lobby local locket lodge lofty log long look loom lotion lotus
loud love lovely loyal lucky lunar lunch lush macaw magic magnet magpie mallet mango mantle map
maple marble march mark market marlin marsh mascot mask match meadow medley mellow melon melt mend
menu meteor mighty mild mill mingle minnow minty mirror misty mitten mix mixed mocha model modern
modest molar monkey moody moon moped mosaic moss mossy moth motor mouse move muddy muffin mug
mulch mural museum music nacho nail nap napkin narrow neat nectar needle nest net nettle newt next
nice nickel nimble noble nod noisy noodle north notch note novel nugget nut nutmeg nutty oak oaken
oasis obey oboe ocean octave office old olive onion opal open orange orbit orca orchid order organ
ornate osprey otter oval oven owl oyster pack paddle page pagoda paint palace palm pan panda panel
pansy papaya paper parade parcel park parka parrot party pass pasta pastry pat path patio peach
peanut pebble pecan peck pen pencil pepper perch perky pewter piano pick pickle picnic pie pig
pillow pilot pinch pine pipe pirate pixel pixie pizza plan planet plant plate play plaza plucky
plug plume pocket poem point polar polite polka poncho pond pony poodle pop poplar poppy porch
portal possum post pot potato potent potter pouch prawn press pretty prime print prism proper
proud puffin puffy pull pulse puma pump puppet puppy pure purple push puzzle quack quail quest
quick quiet quill quilt quirky quiver quiz rabbit race radar radio radish radius raft rafter rainy
raisin ranch rapid rare rascal rattle raven razor ready recipe reef regal relay relish remote
rhino ribbon rice rich riddle ride ridge rinse ripe ripple river roam robe robin robot rock rocket
rocky roof rope rosy round row rowdy royal rub ruby rudder rug ruler run runway rush rustic rustle
rusty saddle safari sage salad salmon salsa salt salty sand sandal sandy satin saucer sauna save
savvy scarf school scone scoop screen scroll scrub sculpt search secret seesaw send sequin serve
sesame shadow shady shaggy shake shanty share sharp sheep shelf shell shield shine shiny ship
shirt shore short shout shovel shrub shy signal silent silk silky silly silo silver simple sing
singer sip siren sit skate sketch ski skip skirt sky slalom slate sled sleek sleepy slick slide
slow small smart smile smoky smooth snail snake snappy snowy snug soak sock sofa soft soil solar
solid solve sonnet soup spade spare spark speedy spicy spiky spin spire splash spoon sporty spotty
spray spring sprint sprout spruce spry square squash squeak squid stable stack stamp stand stanza
star start statue stay steady steep steer stem step stew stick stiff still stir stomp stone stony
stool stop storm stormy stout stove straw stream street string stroll strong studio sturdy sugar
sugary summer summit sunny sunset super superb swamp swan swap sweep swift swim swing syrup tabby
table tablet taco talk tall tame tandem tangle tango tangy tank tape target tart tassel taste
tasty tavern teach teacup teal teapot tempo tender tennis tent thank thatch thick thin think
thread throw thumb tiara ticket tickle tidy tiger timber tinsel tiny tip toast toasty toffee token
tomato tonic tool tooth top topaz torch toss totem toucan tough towel tower toy trace track trade
trail train travel tray tree trek tricky trifle trim tripod trophy trot trout truck true trunk
trusty try tug tulip tumble tundra tunnel turkey turnip turret turtle tutor tuxedo tweed twig
twirl twist unique unite unwrap upper urban urchin useful valley van vanish vase vast velvet
vessel vinyl viola violet violin visit visor vivid vocal vortex vote wacky wafer waffle wag wagon
walk wallet walnut walrus wand wander want warm warren wary wasabi wash watch water wavy weasel
weaver wedge wheat wheel whisk wide widget wig wild willow win winch window windy wing wink winter
wintry wise wish witty wizard wobble wobbly wok wolf wombat wonder woody woolly wordy work worthy
wreath wren yacht yak yard yarn yawn yeti yodel yoga yonder young yummy zany zebra zero zesty
zigzag zinc zip zippy zone zoo zoom
`
  .trim()
  .split(/\s+/);
