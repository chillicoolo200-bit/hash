'use strict';
/**
 * data.js - the content of the planner, kept apart from the logic in core.js.
 *
 * Event types, budget presets, task templates and the built-in (no-AI) ideas.
 * Plain data plus three tiny builders; nothing here runs any planning logic.
 * Works in the browser (window.AnushthanData) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AnushthanData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const EVENT_TYPES = Object.freeze({
    puja: { bn: 'পাড়ার পুজো', en: 'Neighbourhood puja' },
    college_fest: { bn: 'কলেজ ফেস্ট', en: 'College fest' },
    birthday: { bn: 'জন্মদিন', en: 'Birthday party' },
    home_event: { bn: 'ঘরোয়া অনুষ্ঠান (বিয়ে, অন্নপ্রাশন)', en: 'Family event (wedding, annaprashan)' },
  });

  const cat = (bn, en) => ({ bn, en });
  const CATEGORIES = Object.freeze({
    pandal_decor: cat('মণ্ডপ ও সাজসজ্জা', 'Pandal and decoration'),
    idol_ritual: cat('প্রতিমা ও পূজার সামগ্রী', 'Idol and puja items'),
    food_bhog: cat('ভোগ ও প্রসাদ', 'Bhog and prasad'),
    sound_light: cat('সাউন্ড ও আলো', 'Sound and lights'),
    printing_publicity: cat('ছাপা ও প্রচার', 'Printing and publicity'),
    volunteers_logistics: cat('স্বেচ্ছাসেবক ও ব্যবস্থাপনা', 'Volunteers and logistics'),
    stage_decor: cat('স্টেজ ও সাজসজ্জা', 'Stage and decoration'),
    food_refreshments: cat('খাবার ও জল', 'Food and water'),
    prizes_certificates: cat('পুরস্কার ও সার্টিফিকেট', 'Prizes and certificates'),
    logistics_safety: cat('নিরাপত্তা ও প্রাথমিক চিকিৎসা', 'Safety and first aid'),
    venue_decor: cat('জায়গা ও সাজসজ্জা', 'Venue and decoration'),
    food: cat('খাবার', 'Food'),
    cake_gifts: cat('কেক ও রিটার্ন গিফট', 'Cake and return gifts'),
    entertainment: cat('খেলা ও বিনোদন', 'Games and entertainment'),
    photography: cat('ছবি তোলা', 'Photography'),
    food_catering: cat('খাবার ও ক্যাটারিং', 'Food and catering'),
    invitations_printing: cat('কার্ড ও আমন্ত্রণ', 'Invitations'),
    entertainment_music: cat('গান-বাজনা', 'Music'),
    logistics_transport: cat('অতিথির থাকা ও যাতায়াত', 'Guest stay and travel'),
    contingency: cat('অপ্রত্যাশিত খরচের তহবিল', 'Contingency fund'),
  });

  // Share of the total budget per category (percent). Each preset must add up to 100.
  const PRESETS = Object.freeze({
    puja: {
      shares: [['pandal_decor', 30], ['idol_ritual', 20], ['food_bhog', 20], ['sound_light', 10],
        ['printing_publicity', 5], ['volunteers_logistics', 5], ['contingency', 10]],
      foodCategory: 'food_bhog', minFoodPerHead: 20, trimFirst: ['printing_publicity', 'sound_light'],
    },
    college_fest: {
      shares: [['stage_decor', 20], ['sound_light', 20], ['food_refreshments', 20], ['prizes_certificates', 15],
        ['printing_publicity', 10], ['logistics_safety', 5], ['contingency', 10]],
      foodCategory: 'food_refreshments', minFoodPerHead: 30, trimFirst: ['printing_publicity', 'stage_decor'],
    },
    birthday: {
      shares: [['venue_decor', 20], ['food', 40], ['cake_gifts', 15], ['entertainment', 10],
        ['photography', 5], ['contingency', 10]],
      foodCategory: 'food', minFoodPerHead: 80, trimFirst: ['photography', 'entertainment'],
    },
    home_event: {
      shares: [['food_catering', 40], ['venue_decor', 20], ['photography', 10], ['invitations_printing', 5],
        ['entertainment_music', 10], ['logistics_transport', 5], ['contingency', 10]],
      foodCategory: 'food_catering', minFoodPerHead: 80, trimFirst: ['entertainment_music', 'photography'],
    },
  });

  // Task templates. dueBefore = days before the event the task should be finished.
  // Rule (checked by tests): tasks are listed after everything they depend on, and a
  // task is never due earlier than a task it depends on.
  const task = (id, dueBefore, dependsOn, category, bn, en, ask) => ({
    id, dueBefore, dependsOn, category, title: { bn, en }, ask: ask || null,
  });
  const ask = (bn, en) => ({ bn, en });

  const TEMPLATES = Object.freeze({
    puja: [
      task('committee', 35, [], null, 'কমিটি গঠন ও দায়িত্ব ভাগ', 'Form the committee and split duties'),
      task('permission', 28, ['committee'], null, 'থানা ও পুরসভা/পঞ্চায়েতের অনুমতি নেওয়া', 'Get police and civic permissions',
        ask(['মাইক বাজানোর সময়সীমা কী (স্থানীয় অফিসে যাচাই করো)?', 'মণ্ডপ বা রাস্তা ব্যবহারের অনুমতিপত্র লাগবে কি?', 'আবেদনের শেষ তারিখ ও ফি কত?'],
          ['What are the loudspeaker time limits (confirm locally)?', 'Is a permit needed for the pandal or road use?', 'What are the application deadline and fee?'])),
      task('chanda', 30, ['committee'], null, 'বাজেট চূড়ান্ত করে চাঁদা আদায় শুরু', 'Finalise the budget and start collecting contributions'),
      task('idol', 25, ['chanda'], 'idol_ritual', 'প্রতিমা বায়না করা', 'Book the idol',
        ask(['প্রতিমার মাপ ও দাম কত?', 'অগ্রিম কত, বাকিটা কবে?', 'পৌঁছে দেওয়া ও বিসর্জনের ব্যবস্থা কার?'],
          ['What are the idol size and price?', 'How much advance, and when is the balance due?', 'Who handles delivery and immersion?'])),
      task('priest', 20, ['idol'], 'idol_ritual', 'পুরোহিত ঠিক করা ও পূজার সামগ্রীর তালিকা', 'Fix the priest and list puja items'),
      task('pandal', 18, ['permission', 'idol'], 'pandal_decor', 'মণ্ডপ ও সাজসজ্জার কারিগর ঠিক করা', 'Hire the pandal and decoration crew',
        ask(['মণ্ডপ কবে খাড়া হবে, কবে শেষ?', 'বৃষ্টি হলে ঢাকার ব্যবস্থা আছে কি?', 'মোট দাম লিখিতভাবে পাওয়া যাবে কি?'],
          ['When will the pandal go up and when is it finished?', 'Is there rain cover?', 'Can you give the total price in writing?'])),
      task('sound', 14, ['permission'], 'sound_light', 'মাইক, সাউন্ড ও আলো বুক করা', 'Book sound and lights',
        ask(['জেনারেটর বা বিদ্যুতের ব্যবস্থা কার?', 'কত ঘণ্টা চলবে?', 'অগ্রিম ও ফেরতের নিয়ম কী?'],
          ['Who arranges power or a generator?', 'For how many hours?', 'What are the advance and refund terms?'])),
      task('publicity', 12, ['chanda'], 'printing_publicity', 'ব্যানার, পোস্টার ও প্রচার', 'Banners, posters and publicity'),
      task('food', 7, ['chanda'], 'food_bhog', 'ভোগ ও প্রসাদের বাজার-তালিকা আর রাঁধুনি ঠিক করা', 'Plan the bhog shopping list and cooks',
        ask(['কতজনের জন্য রান্না হবে?', 'বাজার কবে ও কে করবে?', 'পরিবেশনে কতজন স্বেচ্ছাসেবক লাগবে?'],
          ['How many people will be served?', 'Who shops, and when?', 'How many volunteers are needed to serve?'])),
      task('volunteers', 5, ['committee'], 'volunteers_logistics', 'স্বেচ্ছাসেবক ও ভিড় সামলানোর ছক', 'Volunteer and crowd plan'),
      task('final', 2, ['pandal', 'sound', 'food'], null, 'সব বুকিং ও দায়িত্ব শেষবার মিলিয়ে দেখা', 'Final check of bookings and duties'),
    ],
    college_fest: [
      task('core', 40, [], null, 'কোর টিম ও দায়িত্ব ভাগ', 'Form the core team and split duties'),
      task('approval', 35, ['core'], null, 'কলেজ কর্তৃপক্ষের অনুমতি ও তারিখ-ভেন্যু চূড়ান্ত', 'Get college approval and fix date and venue',
        ask(['প্রিন্সিপাল বা দায়িত্বপ্রাপ্ত শিক্ষকের লিখিত অনুমতি আছে কি?', 'কোন কোন ঘর বা মাঠ ব্যবহার করা যাবে?', 'অনুষ্ঠান কত রাত পর্যন্ত চলবে?'],
          ['Is there written permission from the principal or teacher in charge?', 'Which rooms or grounds can be used?', 'How late can the event run?'])),
      task('sponsor', 33, ['core'], null, 'বাজেট তৈরি ও স্পনসর খোঁজা', 'Draft the budget and find sponsors',
        ask(['স্পনসরকে কী কী দেখানো হবে (ব্যানার, স্টল)?', 'টাকা কবে ও কীভাবে দেবেন?'],
          ['What will the sponsor get (banner, stall)?', 'When and how will they pay?'])),
      task('events', 28, ['approval'], null, 'প্রতিযোগিতা ও অনুষ্ঠানের তালিকা আর নিয়ম ঠিক করা', 'Fix the events list and rules'),
      task('registration', 24, ['events'], 'printing_publicity', 'রেজিস্ট্রেশন ফর্ম খোলা ও প্রচার শুরু', 'Open registration and start publicity'),
      task('stage', 18, ['approval', 'sponsor'], 'stage_decor', 'স্টেজ ও সাজসজ্জা ঠিক করা', 'Arrange stage and decoration'),
      task('sound', 16, ['approval', 'sponsor'], 'sound_light', 'সাউন্ড ও আলো বুক করা', 'Book sound and lights',
        ask(['কতগুলো মাইক ও স্পিকার পাওয়া যাবে?', 'সাউন্ড-চেকের সময় কখন?', 'অগ্রিম ও ফেরতের নিয়ম কী?'],
          ['How many mics and speakers are included?', 'When is the sound check?', 'What are the advance and refund terms?'])),
      task('prizes', 12, ['events'], 'prizes_certificates', 'পুরস্কার ও সার্টিফিকেট ছাপানো', 'Order prizes and print certificates'),
      task('food', 8, ['sponsor'], 'food_refreshments', 'খাবার ও জলের ব্যবস্থা', 'Arrange food and water'),
      task('safety', 6, ['core'], 'logistics_safety', 'স্বেচ্ছাসেবক, প্রাথমিক চিকিৎসা ও নিরাপত্তা', 'Volunteers, first aid and safety'),
      task('rehearsal', 3, ['stage', 'sound', 'registration'], null, 'রিহার্সাল ও সাউন্ড চেক', 'Rehearsal and sound check'),
      task('final', 1, ['rehearsal', 'prizes', 'food', 'safety'], null, 'শেষবার সব মিলিয়ে দেখা', 'Final check of everything'),
    ],
    birthday: [
      task('guests', 21, [], null, 'অতিথির তালিকা ও সময় ঠিক করা', 'Fix the guest list and time'),
      task('venue', 18, ['guests'], 'venue_decor', 'জায়গা ঠিক করা ও সাজসজ্জার পরিকল্পনা', 'Fix the venue and decoration plan'),
      task('invites', 14, ['guests', 'venue'], null, 'আমন্ত্রণ পাঠানো', 'Send invitations'),
      task('photo', 12, ['venue'], 'photography', 'ছবি তোলার ব্যবস্থা', 'Arrange photography'),
      task('food', 10, ['guests'], 'food', 'খাবার বা ক্যাটারার ঠিক করা', 'Fix the food or caterer',
        ask(['কতজনের মাপে দাম ধরা হয়েছে?', 'কোনও অতিথির খাবারে বাধা (নিরামিষ, এলার্জি) আছে কি?', 'অগ্রিম কত?'],
          ['What headcount is the price based on?', 'Any dietary limits (vegetarian, allergies)?', 'How much advance?'])),
      task('decor_fun', 7, ['venue'], 'entertainment', 'সাজসজ্জা ও খেলা বা বিনোদনের ব্যবস্থা', 'Decoration and games or entertainment'),
      task('gifts', 6, ['guests'], 'cake_gifts', 'রিটার্ন গিফট কেনা', 'Buy return gifts'),
      task('cake', 5, ['guests'], 'cake_gifts', 'কেক অর্ডার করা', 'Order the cake'),
      task('final', 1, ['food', 'decor_fun', 'gifts', 'cake'], null, 'শেষবার সব মিলিয়ে দেখা', 'Final check of everything'),
    ],
    home_event: [
      task('plan', 45, [], null, 'তারিখ ও অতিথির তালিকা ঠিক করা', 'Fix the date and guest list'),
      task('venue', 40, ['plan'], 'venue_decor', 'জায়গা (বাড়ি বা হল) ঠিক করা', 'Fix the venue (home or hall)'),
      task('caterer', 30, ['venue'], 'food_catering', 'ক্যাটারার বা রাঁধুনি ঠিক করা', 'Fix the caterer or cooks',
        ask(['প্লেট-পিছু দাম কত, আর কতজনের মাপে?', 'মেনু লিখিতভাবে পাওয়া যাবে কি?', 'অগ্রিম কত, বাকিটা কবে?'],
          ['What is the per-plate price and for how many?', 'Can the menu be given in writing?', 'How much advance, and when is the balance?'])),
      task('invites', 25, ['venue'], 'invitations_printing', 'কার্ড ছাপা ও আমন্ত্রণ পাঠানো', 'Print and send invitations'),
      task('photo', 20, ['venue'], 'photography', 'ফটোগ্রাফার ঠিক করা', 'Hire the photographer',
        ask(['কত ঘণ্টার জন্য, আর কতগুলো ছবি বা ভিডিও?', 'ছবি কবে পাওয়া যাবে?', 'অগ্রিম ও বাতিলের নিয়ম কী?'],
          ['For how many hours, and how many photos or videos?', 'When will the photos be delivered?', 'What are the advance and cancellation terms?'])),
      task('decor', 18, ['venue'], 'venue_decor', 'সাজসজ্জা ঠিক করা', 'Arrange decoration'),
      task('music', 14, ['venue'], 'entertainment_music', 'গান-বাজনা বা সাউন্ডের ব্যবস্থা', 'Arrange music or sound'),
      task('stay', 10, ['invites'], 'logistics_transport', 'বাইরের অতিথির থাকা ও যাতায়াত', 'Stay and travel for outstation guests'),
      task('final', 2, ['caterer', 'photo', 'decor', 'music', 'stay'], null, 'শেষবার সব মিলিয়ে দেখা', 'Final check of everything'),
    ],
  });

  // Ideas, tips and message wording used when the AI is unavailable (see core.fallbackAssist).
  const FALLBACK = {
    puja: {
      bn: {
        ideas: ['পাড়ার ছোটদের নিয়ে মণ্ডপের সামনে আলপনা প্রতিযোগিতা।', 'শোলা, পাট বা কাপড় দিয়ে হাতে-গড়া সাজ, স্থানীয় কারিগরদের কাজ দিয়ে।',
          'ভোগ পরিবেশনে বাজার, রান্না ও পরিবেশনের আলাদা স্বেচ্ছাসেবক দল।', 'ছোটদের ১৫ মিনিটের সাংস্কৃতিক স্লট, তালিকা আগে থেকে ঠিক করে।', 'শালপাতা বা মাটির খুরিতে প্লাস্টিকমুক্ত ভোগ।'],
        tips: ['চাঁদার হিসাব আর খরচের তালিকা মণ্ডপে টাঙিয়ে দাও, ভরসা বাড়ে।', 'সাউন্ড আর আলো একই বিক্রেতার কাছ থেকে প্যাকেজে নাও, দাম কমে।', 'প্রতিটি বুকিংয়ের অগ্রিম লিখিত রসিদে নাও।'],
      },
      en: {
        ideas: ['An alpona drawing contest for local kids in front of the pandal.', 'Handmade decoration from shola, jute or cloth, giving work to local artisans.',
          'Separate volunteer teams for shopping, cooking and serving the bhog.', 'A 15-minute cultural slot for children, with the list fixed in advance.', 'Plastic-free bhog on sal leaves or clay cups.'],
        tips: ['Display the contribution and expense list at the pandal to build trust.', 'Book sound and lights as one package from one vendor to cut the price.', 'Take a written receipt for every advance.'],
      },
    },
    college_fest: {
      bn: {
        ideas: ['একই সময়ে তিনটি ছোট মঞ্চে আলাদা প্রতিযোগিতা, যাতে ভিড় ভাগ হয়।', 'ডিপার্টমেন্ট-ভিত্তিক পয়েন্ট তালিকা, সবার সামনে সরাসরি দেখানো।', 'পুরনো ছাত্রদের নিয়ে ছোট আলোচনা বা কেরিয়ার-কথা।',
          'স্টলে স্থানীয় খাবারের দোকানকে জায়গা দিয়ে খাবারের খরচ কমানো।', 'ফেস্টের শেষে সবাইকে অনলাইন ফিডব্যাক ফর্ম।'],
        tips: ['স্পনসরকে স্পষ্টভাবে লিখে দাও বিনিময়ে কী পাবেন।', 'সার্টিফিকেটের নকশা একবারই বানিয়ে নাম বদলে ছাপো।', 'রেজিস্ট্রেশনে সামান্য ফি রাখলে অংশগ্রহণ নিশ্চিত হয়।'],
      },
      en: {
        ideas: ['Three small stages running different contests at once to spread the crowd.', 'A live department-wise points table everyone can see.', 'A short talk by alumni on careers.',
          'Give local food vendors stall space to cut the food cost.', 'An online feedback form for everyone at the end.'],
        tips: ['Write down clearly what each sponsor gets in return.', 'Design the certificate once and only change the names when printing.', 'A small registration fee makes participation more reliable.'],
      },
    },
    birthday: {
      bn: {
        ideas: ['বাড়িতে থিম ঠিক করে নিজের হাতে সাজ, যেমন বইয়ের গল্প বা রং।', 'বয়স অনুযায়ী দুটি খেলার দল, প্রতিটিতে ছোট পুরস্কার।', 'ফটো কর্নার, ফোনেই ছবি তুলে পরে সবাইকে পাঠানো।',
          'রিটার্ন গিফটে একটি বই বা গাছের চারা।', 'কেক কাটার আগে ১০ মিনিটের গল্প বা গানের স্লট।'],
        tips: ['অতিথির সংখ্যা চূড়ান্ত করে তারপর খাবারের অর্ডার দাও।', 'কেক আর খাবার আলাদা দোকান থেকে দাম মিলিয়ে নাও।', 'সাজের জিনিস ভাড়া নাও, কিনো না।'],
      },
      en: {
        ideas: ['A home theme you decorate yourself, such as a storybook or a colour.', 'Two age-based game teams with small prizes.', 'A photo corner where guests are photographed on a phone and sent the pictures later.',
          'A book or a sapling as the return gift.', 'A 10-minute story or song slot before the cake.'],
        tips: ['Fix the guest count before placing the food order.', 'Compare cake and food prices from different shops.', 'Rent decoration items instead of buying.'],
      },
    },
    home_event: {
      bn: {
        ideas: ['অতিথির জন্য ছোট স্বাগত-টেবিল, নামের কার্ডসহ।', 'পরিবারের পুরনো ছবি দিয়ে একটি স্মৃতির দেয়াল।', 'খাবারের মেনুতে একটি বাড়ির রান্নার পদ, যাতে খরচ কমে আর স্বাদ বাড়ে।',
          'বাচ্চাদের জন্য আলাদা কোণ ও দেখাশোনার একজন।', 'বাইরের অতিথিদের জন্য যাতায়াতের একটি ছোট নির্দেশিকা।'],
        tips: ['ক্যাটারারের মেনু ও দাম লিখিত নাও।', 'কার্ড ছাপার আগে নাম-বানান আরেকজনকে দিয়ে মিলিয়ে নাও।', 'অনুষ্ঠানের আগের রাতে সব জিনিস গুনে রাখো।'],
      },
      en: {
        ideas: ['A small welcome table with name cards for guests.', 'A memory wall built from old family photographs.', 'One home-cooked dish on the menu to cut cost and add taste.',
          'A separate kids corner with one person looking after it.', 'A short travel guide for guests coming from outside.'],
        tips: ['Get the caterer menu and price in writing.', 'Have someone else check the spelling of names before printing cards.', 'Count every item the night before.'],
      },
    },
  };

  return { EVENT_TYPES, CATEGORIES, PRESETS, TEMPLATES, FALLBACK };
});