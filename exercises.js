// Built-in exercise library.
// m = main muscles worked, s = secondary muscles, eq = equipment, cue = form tips
const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Abs', 'Quads', 'Hamstrings', 'Glutes', 'Calves'];

const EXERCISES = [
  // CHEST
  { id: 'bench', name: 'Bench Press', m: ['Chest'], s: ['Triceps', 'Shoulders'], eq: 'Barbell', cue: 'Feet flat, shoulder blades squeezed together. Lower the bar to mid-chest, elbows about 45° from your body, then press up.' },
  { id: 'incbench', name: 'Incline Bench Press', m: ['Chest'], s: ['Shoulders', 'Triceps'], eq: 'Barbell', cue: 'Bench at 30–45°. Lower the bar to the upper chest and press up, keeping your back slightly arched.' },
  { id: 'dbbench', name: 'Dumbbell Bench Press', m: ['Chest'], s: ['Triceps', 'Shoulders'], eq: 'Dumbbell', cue: 'Lower the dumbbells slowly to chest level, then press up and slightly inward.' },
  { id: 'incdb', name: 'Incline Dumbbell Press', m: ['Chest'], s: ['Shoulders', 'Triceps'], eq: 'Dumbbell', cue: 'Bench at 30–45°. Keep wrists stacked over elbows and press without clanging the weights.' },
  { id: 'dips', name: 'Chest Dip', m: ['Chest'], s: ['Triceps', 'Shoulders'], eq: 'Bodyweight', cue: 'Lean forward slightly, lower until shoulders are just below elbows, then push up.' },
  { id: 'pushup', name: 'Push Up', m: ['Chest'], s: ['Triceps', 'Shoulders', 'Abs'], eq: 'Bodyweight', cue: 'Body in a straight line from head to heels. Lower your chest to the floor and push back up.' },
  { id: 'cablefly', name: 'Cable Fly', m: ['Chest'], s: ['Shoulders'], eq: 'Cable', cue: 'Slight bend in elbows. Bring your hands together in a hugging motion and squeeze your chest.' },
  { id: 'pecdeck', name: 'Pec Deck', m: ['Chest'], s: [], eq: 'Machine', cue: 'Keep your back on the pad and bring the handles together slowly. Control the way back.' },
  // BACK
  { id: 'deadlift', name: 'Deadlift', m: ['Back', 'Hamstrings', 'Glutes'], s: ['Forearms', 'Quads'], eq: 'Barbell', cue: 'Bar over mid-foot, flat back, chest up. Push the floor away and lock out with your hips.' },
  { id: 'row', name: 'Barbell Row', m: ['Back'], s: ['Biceps', 'Forearms'], eq: 'Barbell', cue: 'Hinge forward to about 45°, keep your back flat, pull the bar to your lower chest.' },
  { id: 'dbrow', name: 'Dumbbell Row', m: ['Back'], s: ['Biceps'], eq: 'Dumbbell', cue: 'One hand and knee on the bench. Pull the dumbbell toward your hip, elbow close to your body.' },
  { id: 'pullup', name: 'Pull Up', m: ['Back'], s: ['Biceps', 'Forearms'], eq: 'Bodyweight', cue: 'Start from a dead hang, pull your chest toward the bar, lower with control.' },
  { id: 'chinup', name: 'Chin Up', m: ['Back', 'Biceps'], s: ['Forearms'], eq: 'Bodyweight', cue: 'Palms facing you. Pull until your chin is over the bar, then lower fully.' },
  { id: 'latpull', name: 'Lat Pulldown', m: ['Back'], s: ['Biceps'], eq: 'Cable', cue: 'Lean back slightly and pull the bar to your upper chest. Drive your elbows down.' },
  { id: 'cablerow', name: 'Seated Cable Row', m: ['Back'], s: ['Biceps'], eq: 'Cable', cue: 'Sit tall, pull the handle to your stomach, squeeze your shoulder blades together.' },
  { id: 'tbarrow', name: 'T-Bar Row', m: ['Back'], s: ['Biceps', 'Forearms'], eq: 'Machine', cue: 'Chest up, back flat, pull the handles to your chest.' },
  { id: 'facepull', name: 'Face Pull', m: ['Shoulders', 'Back'], s: [], eq: 'Cable', cue: 'Rope at face height. Pull toward your forehead with elbows high and hands apart.' },
  { id: 'shrug', name: 'Shrug', m: ['Back'], s: ['Forearms'], eq: 'Dumbbell', cue: 'Lift your shoulders straight up toward your ears, hold for a second, lower slowly.' },
  // SHOULDERS
  { id: 'ohp', name: 'Overhead Press', m: ['Shoulders'], s: ['Triceps', 'Abs'], eq: 'Barbell', cue: 'Squeeze glutes and abs. Press the bar straight up and move your head through at the top.' },
  { id: 'dbohp', name: 'Dumbbell Shoulder Press', m: ['Shoulders'], s: ['Triceps'], eq: 'Dumbbell', cue: 'Start at ear level, press up until arms are straight, avoid arching your lower back.' },
  { id: 'latraise', name: 'Lateral Raise', m: ['Shoulders'], s: [], eq: 'Dumbbell', cue: 'Slight bend in elbows. Raise the weights out to the side up to shoulder height.' },
  { id: 'cablelat', name: 'Cable Lateral Raise', m: ['Shoulders'], s: [], eq: 'Cable', cue: 'Stand side-on to the cable. Raise your arm out to the side to shoulder height.' },
  { id: 'reardelt', name: 'Rear Delt Fly', m: ['Shoulders'], s: ['Back'], eq: 'Dumbbell', cue: 'Hinge forward, raise the weights out to the side, lead with your elbows.' },
  { id: 'arnold', name: 'Arnold Press', m: ['Shoulders'], s: ['Triceps'], eq: 'Dumbbell', cue: 'Start with palms facing you, rotate them outward as you press up.' },
  // ARMS
  { id: 'curl', name: 'Barbell Curl', m: ['Biceps'], s: ['Forearms'], eq: 'Barbell', cue: 'Elbows fixed at your sides. Curl up without swinging, lower slowly.' },
  { id: 'dbcurl', name: 'Dumbbell Curl', m: ['Biceps'], s: ['Forearms'], eq: 'Dumbbell', cue: 'Turn your palms up as you curl. Do not swing your body.' },
  { id: 'hammer', name: 'Hammer Curl', m: ['Biceps', 'Forearms'], s: [], eq: 'Dumbbell', cue: 'Palms facing each other the whole time. Curl up, lower slowly.' },
  { id: 'preacher', name: 'Preacher Curl', m: ['Biceps'], s: [], eq: 'Machine', cue: 'Arms flat on the pad. Lower all the way down with control.' },
  { id: 'cablecurl', name: 'Cable Curl', m: ['Biceps'], s: ['Forearms'], eq: 'Cable', cue: 'Keep elbows still and squeeze at the top.' },
  { id: 'pushdown', name: 'Tricep Pushdown', m: ['Triceps'], s: [], eq: 'Cable', cue: 'Elbows pinned to your sides. Push down until arms are straight.' },
  { id: 'ohext', name: 'Overhead Tricep Extension', m: ['Triceps'], s: [], eq: 'Cable', cue: 'Arms by your ears, lower the weight behind your head, extend fully.' },
  { id: 'skull', name: 'Skull Crusher', m: ['Triceps'], s: [], eq: 'Barbell', cue: 'Lower the bar toward your forehead by bending only at the elbows.' },
  { id: 'cgbench', name: 'Close-Grip Bench Press', m: ['Triceps'], s: ['Chest', 'Shoulders'], eq: 'Barbell', cue: 'Hands shoulder-width apart, elbows tucked in close to your body.' },
  { id: 'wristcurl', name: 'Wrist Curl', m: ['Forearms'], s: [], eq: 'Dumbbell', cue: 'Forearms on your thighs, curl only at the wrist.' },
  // LEGS
  { id: 'squat', name: 'Squat', m: ['Quads', 'Glutes'], s: ['Hamstrings', 'Abs'], eq: 'Barbell', cue: 'Bar on upper back, brace your core, sit down between your heels until thighs are at least parallel.' },
  { id: 'frontsquat', name: 'Front Squat', m: ['Quads'], s: ['Glutes', 'Abs'], eq: 'Barbell', cue: 'Bar on front of shoulders, elbows high, stay upright.' },
  { id: 'gobletsquat', name: 'Goblet Squat', m: ['Quads', 'Glutes'], s: ['Abs'], eq: 'Dumbbell', cue: 'Hold a dumbbell at your chest and squat deep with your chest up.' },
  { id: 'legpress', name: 'Leg Press', m: ['Quads', 'Glutes'], s: ['Hamstrings'], eq: 'Machine', cue: 'Lower until knees are about 90°, keep your lower back on the pad.' },
  { id: 'hacksquat', name: 'Hack Squat', m: ['Quads'], s: ['Glutes'], eq: 'Machine', cue: 'Shoulders under the pads, lower deep, push through your whole foot.' },
  { id: 'rdl', name: 'Romanian Deadlift', m: ['Hamstrings', 'Glutes'], s: ['Back'], eq: 'Barbell', cue: 'Soft knees, push hips back, lower the bar along your legs until you feel a hamstring stretch.' },
  { id: 'lunge', name: 'Walking Lunge', m: ['Quads', 'Glutes'], s: ['Hamstrings'], eq: 'Dumbbell', cue: 'Long step forward, back knee almost touches the floor, stay upright.' },
  { id: 'bss', name: 'Bulgarian Split Squat', m: ['Quads', 'Glutes'], s: ['Hamstrings'], eq: 'Dumbbell', cue: 'Back foot on a bench. Lower straight down on the front leg.' },
  { id: 'legext', name: 'Leg Extension', m: ['Quads'], s: [], eq: 'Machine', cue: 'Straighten your legs fully, squeeze, lower slowly.' },
  { id: 'legcurl', name: 'Leg Curl', m: ['Hamstrings'], s: [], eq: 'Machine', cue: 'Curl your heels toward your glutes, control the way back.' },
  { id: 'hipthrust', name: 'Hip Thrust', m: ['Glutes'], s: ['Hamstrings'], eq: 'Barbell', cue: 'Upper back on a bench, bar on hips. Drive hips up and squeeze glutes at the top.' },
  { id: 'calfraise', name: 'Standing Calf Raise', m: ['Calves'], s: [], eq: 'Machine', cue: 'Full stretch at the bottom, rise up as high as possible, pause at the top.' },
  { id: 'seatcalf', name: 'Seated Calf Raise', m: ['Calves'], s: [], eq: 'Machine', cue: 'Slow and controlled with a pause at the bottom stretch.' },
  // CORE
  { id: 'plank', name: 'Plank', m: ['Abs'], s: ['Shoulders'], eq: 'Bodyweight', cue: 'Straight line from head to heels, squeeze glutes and abs. Log seconds as reps.' },
  { id: 'crunch', name: 'Cable Crunch', m: ['Abs'], s: [], eq: 'Cable', cue: 'Kneel, hold the rope by your head and curl your chest toward your knees.' },
  { id: 'legraise', name: 'Hanging Leg Raise', m: ['Abs'], s: ['Forearms'], eq: 'Bodyweight', cue: 'Hang from the bar and raise your legs without swinging.' },
  { id: 'abwheel', name: 'Ab Wheel Rollout', m: ['Abs'], s: ['Shoulders'], eq: 'Other', cue: 'Roll out slowly with a flat back, then pull back using your abs.' },
  { id: 'russian', name: 'Russian Twist', m: ['Abs'], s: [], eq: 'Bodyweight', cue: 'Lean back slightly and rotate side to side. Count each side as one rep.' },
];

// Pre-built routine templates
const TEMPLATES = [
  { name: 'Push', ex: [['bench', 4, 8], ['ohp', 3, 8], ['incdb', 3, 10], ['latraise', 3, 15], ['pushdown', 3, 12], ['ohext', 3, 12]] },
  { name: 'Pull', ex: [['deadlift', 3, 5], ['pullup', 3, 8], ['row', 3, 8], ['facepull', 3, 15], ['dbcurl', 3, 12], ['hammer', 3, 12]] },
  { name: 'Legs', ex: [['squat', 4, 6], ['rdl', 3, 8], ['legpress', 3, 10], ['legcurl', 3, 12], ['calfraise', 4, 15], ['legraise', 3, 12]] },
  { name: 'Upper Body', ex: [['bench', 4, 6], ['row', 4, 8], ['dbohp', 3, 10], ['latpull', 3, 10], ['dbcurl', 2, 12], ['pushdown', 2, 12]] },
  { name: 'Lower Body', ex: [['squat', 4, 6], ['rdl', 3, 8], ['bss', 3, 10], ['legcurl', 3, 12], ['calfraise', 3, 15], ['plank', 3, 45]] },
  { name: 'Full Body', ex: [['squat', 3, 8], ['bench', 3, 8], ['row', 3, 8], ['dbohp', 2, 10], ['rdl', 2, 10], ['plank', 2, 45]] },
];
