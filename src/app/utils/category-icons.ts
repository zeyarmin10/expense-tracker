import {
  LucideIconData,
  // Food & Drink
  Utensils, Coffee, Pizza, Wine, CookingPot, Sandwich, Cake, Salad,
  IceCreamCone, Beer, Croissant, Cookie, Donut, Beef, Soup, Fish, Candy, Popcorn, Milk,
  Apple, Banana, Cherry, Grape, Carrot, LeafyGreen, Wheat, Egg, EggFried,
  ChefHat, CupSoda, CakeSlice, Dessert, Vegan,
  // Transport
  Car, Bus, Plane, TrainFront, Motorbike, Fuel, Bike, Luggage,
  Truck, Ship, Scooter, Anchor, CableCar, Route, Navigation, MapPinned, Forklift,
  // Shopping
  ShoppingBag, Shirt, Gem, Tag, Gift, Scissors, Backpack, Sparkles,
  ShoppingCart, Store, Handbag, CreditCard, Receipt,
  Diamond, WalletCards, Barcode, Nfc, Sticker, Stamp, Badge,
  // Entertainment
  Gamepad, Film, Music, Book, Dumbbell, Headphones, Palette, Camera,
  Trophy, Medal, Crown, Puzzle, Ticket, PartyPopper, Theater, Dices,
  Guitar, Drum, MicVocal, Drama, Clapperboard, Album, CassetteTape, Volleyball,
  // Home & Utilities
  House, Lightbulb, Droplet, Wrench, Plug, Sofa, Laptop, Smartphone,
  Bed, Refrigerator, Microwave, Fan, WashingMachine, Hammer, DoorClosed, Mailbox,
  AirVent, Armchair, Bath, Castle, Hotel, Factory, Church,
  Drill, PaintRoller, PaintBucket, Paintbrush, Recycle,
  HardDrive, CircuitBoard, Database, Wifi, Cog,
  // Health
  Pill, Hospital, HeartPulse, PawPrint, Leaf, Heart, Stethoscope, Activity,
  Syringe, Bandage, Thermometer, Brain, Glasses, Ambulance,
  BriefcaseMedical, TestTube, Microscope, Dna, FlaskConical, Atom, Footprints,
  // Work & Finance
  Briefcase, Banknote, Coins, PiggyBank, GraduationCap, Globe, Tv, Cpu,
  Calculator, TrendingUp, Building, Building2, Vault, Landmark, Percent, DollarSign,
  Newspaper, Projector, Phone, Mail, Contact,
  // Education
  School, Pencil, BookOpen, Library, Award,
  Notebook, NotebookPen, Eraser, Pen,
  // Travel & Nature
  Compass, MapPin, Flag, Mountain, Tent, TreePalm, Sun, Moon, Snowflake, Waves, Flower,
  Trees, TreeDeciduous, TreePine, Clover, Binoculars, Flashlight, Satellite, Rocket, Sprout,
  // Misc
  Star, Bell, Key, Flame, Zap, Baby, Umbrella, Wallet,
  Sword, Shield, Watch, Dog, Cat, Bird,
  Timer, Hourglass, AlarmClock, Calendar, Goal, Milestone, ScanBarcode, ScanQrCode, FileText,
} from 'lucide-angular';

export const CATEGORY_ICONS: { name: string; icon: LucideIconData; hue: number }[] = [
  // Food & Drink
  { name: 'utensils',       icon: Utensils,     hue: 28  }, { name: 'coffee',        icon: Coffee,       hue: 28  },
  { name: 'pizza',          icon: Pizza,        hue: 20  }, { name: 'wine',          icon: Wine,         hue: 350 },
  { name: 'cooking-pot',    icon: CookingPot,   hue: 28  }, { name: 'sandwich',      icon: Sandwich,     hue: 32  },
  { name: 'cake',           icon: Cake,         hue: 320 }, { name: 'salad',         icon: Salad,        hue: 115 },
  { name: 'ice-cream-cone', icon: IceCreamCone, hue: 185 }, { name: 'beer',          icon: Beer,         hue: 42  },
  { name: 'croissant',      icon: Croissant,    hue: 38  }, { name: 'cookie',        icon: Cookie,       hue: 30  },
  { name: 'donut',          icon: Donut,        hue: 320 }, { name: 'beef',          icon: Beef,         hue: 15  },
  { name: 'soup',           icon: Soup,         hue: 28  }, { name: 'fish',          icon: Fish,         hue: 205 },
  { name: 'candy',          icon: Candy,        hue: 315 }, { name: 'popcorn',       icon: Popcorn,      hue: 48  },
  { name: 'milk',           icon: Milk,         hue: 200 }, { name: 'apple',         icon: Apple,        hue: 5   },
  { name: 'banana',         icon: Banana,       hue: 55  }, { name: 'cherry',        icon: Cherry,       hue: 350 },
  { name: 'grape',          icon: Grape,        hue: 280 }, { name: 'carrot',        icon: Carrot,       hue: 25  },
  { name: 'leafy-green',    icon: LeafyGreen,   hue: 118 }, { name: 'wheat',         icon: Wheat,        hue: 48  },
  { name: 'egg',            icon: Egg,          hue: 48  }, { name: 'egg-fried',     icon: EggFried,     hue: 45  },
  { name: 'chef-hat',       icon: ChefHat,      hue: 220 }, { name: 'cup-soda',      icon: CupSoda,      hue: 195 },
  { name: 'cake-slice',     icon: CakeSlice,    hue: 320 }, { name: 'dessert',       icon: Dessert,      hue: 315 },
  { name: 'vegan',          icon: Vegan,        hue: 118 },
  // Transport
  { name: 'car',            icon: Car,          hue: 215 }, { name: 'bus',           icon: Bus,          hue: 205 },
  { name: 'plane',          icon: Plane,        hue: 210 }, { name: 'train-front',   icon: TrainFront,   hue: 220 },
  { name: 'motorbike',      icon: Motorbike,    hue: 28  }, { name: 'fuel',          icon: Fuel,         hue: 28  },
  { name: 'bike',           icon: Bike,         hue: 118 }, { name: 'luggage',       icon: Luggage,      hue: 205 },
  { name: 'truck',          icon: Truck,        hue: 205 }, { name: 'ship',          icon: Ship,         hue: 205 },
  { name: 'scooter',        icon: Scooter,      hue: 195 }, { name: 'anchor',        icon: Anchor,       hue: 215 },
  { name: 'cable-car',      icon: CableCar,     hue: 210 }, { name: 'route',         icon: Route,        hue: 200 },
  { name: 'navigation',     icon: Navigation,   hue: 10  }, { name: 'map-pinned',    icon: MapPinned,    hue: 5   },
  { name: 'forklift',       icon: Forklift,     hue: 45  },
  // Shopping
  { name: 'shopping-bag',   icon: ShoppingBag,  hue: 320 }, { name: 'shirt',         icon: Shirt,        hue: 210 },
  { name: 'gem',            icon: Gem,          hue: 265 }, { name: 'tag',           icon: Tag,          hue: 200 },
  { name: 'gift',           icon: Gift,         hue: 330 }, { name: 'scissors',      icon: Scissors,     hue: 0   },
  { name: 'backpack',       icon: Backpack,     hue: 210 }, { name: 'sparkles',      icon: Sparkles,     hue: 50  },
  { name: 'shopping-cart',  icon: ShoppingCart, hue: 200 }, { name: 'store',         icon: Store,        hue: 200 },
  { name: 'handbag',        icon: Handbag,      hue: 320 }, { name: 'credit-card',   icon: CreditCard,   hue: 215 },
  { name: 'receipt',        icon: Receipt,      hue: 200 }, { name: 'diamond',       icon: Diamond,      hue: 265 },
  { name: 'wallet-cards',   icon: WalletCards,  hue: 200 }, { name: 'barcode',       icon: Barcode,      hue: 200 },
  { name: 'nfc',            icon: Nfc,          hue: 200 }, { name: 'sticker',       icon: Sticker,      hue: 330 },
  { name: 'stamp',          icon: Stamp,        hue: 205 }, { name: 'badge',         icon: Badge,        hue: 215 },
  // Entertainment
  { name: 'gamepad',        icon: Gamepad,      hue: 270 }, { name: 'film',          icon: Film,         hue: 265 },
  { name: 'music',          icon: Music,        hue: 330 }, { name: 'book',          icon: Book,         hue: 215 },
  { name: 'dumbbell',       icon: Dumbbell,     hue: 200 }, { name: 'headphones',    icon: Headphones,   hue: 265 },
  { name: 'palette',        icon: Palette,      hue: 28  }, { name: 'camera',        icon: Camera,       hue: 210 },
  { name: 'trophy',         icon: Trophy,       hue: 48  }, { name: 'medal',         icon: Medal,        hue: 45  },
  { name: 'crown',          icon: Crown,        hue: 48  }, { name: 'puzzle',        icon: Puzzle,       hue: 270 },
  { name: 'ticket',         icon: Ticket,       hue: 265 }, { name: 'party-popper',  icon: PartyPopper,  hue: 45  },
  { name: 'theater',        icon: Theater,      hue: 270 }, { name: 'dices',         icon: Dices,        hue: 265 },
  { name: 'guitar',         icon: Guitar,       hue: 32  }, { name: 'drum',          icon: Drum,         hue: 28  },
  { name: 'mic-vocal',      icon: MicVocal,     hue: 270 }, { name: 'drama',         icon: Drama,        hue: 265 },
  { name: 'clapperboard',   icon: Clapperboard, hue: 270 }, { name: 'album',         icon: Album,        hue: 270 },
  { name: 'cassette-tape',  icon: CassetteTape, hue: 265 }, { name: 'volleyball',    icon: Volleyball,   hue: 200 },
  // Home & Utilities
  { name: 'house',          icon: House,        hue: 200 }, { name: 'lightbulb',     icon: Lightbulb,    hue: 50  },
  { name: 'droplet',        icon: Droplet,      hue: 200 }, { name: 'wrench',        icon: Wrench,       hue: 200 },
  { name: 'plug',           icon: Plug,         hue: 200 }, { name: 'sofa',          icon: Sofa,         hue: 32  },
  { name: 'laptop',         icon: Laptop,       hue: 215 }, { name: 'smartphone',    icon: Smartphone,   hue: 215 },
  { name: 'bed',            icon: Bed,          hue: 200 }, { name: 'refrigerator',  icon: Refrigerator, hue: 195 },
  { name: 'microwave',      icon: Microwave,    hue: 200 }, { name: 'fan',           icon: Fan,          hue: 190 },
  { name: 'washing-machine',icon: WashingMachine,hue: 195}, { name: 'hammer',        icon: Hammer,       hue: 28  },
  { name: 'door-closed',    icon: DoorClosed,   hue: 28  }, { name: 'mailbox',       icon: Mailbox,      hue: 210 },
  { name: 'air-vent',       icon: AirVent,      hue: 190 }, { name: 'armchair',      icon: Armchair,     hue: 32  },
  { name: 'bath',           icon: Bath,         hue: 195 }, { name: 'castle',        icon: Castle,       hue: 205 },
  { name: 'hotel',          icon: Hotel,        hue: 205 }, { name: 'factory',       icon: Factory,      hue: 210 },
  { name: 'church',         icon: Church,       hue: 205 }, { name: 'drill',         icon: Drill,        hue: 28  },
  { name: 'paint-roller',   icon: PaintRoller,  hue: 28  }, { name: 'paint-bucket',  icon: PaintBucket,  hue: 28  },
  { name: 'paintbrush',     icon: Paintbrush,   hue: 28  }, { name: 'recycle',       icon: Recycle,      hue: 118 },
  { name: 'hard-drive',     icon: HardDrive,    hue: 215 }, { name: 'circuit-board', icon: CircuitBoard, hue: 118 },
  { name: 'database',       icon: Database,     hue: 215 }, { name: 'wifi',          icon: Wifi,         hue: 210 },
  { name: 'cog',            icon: Cog,          hue: 200 },
  // Health
  { name: 'pill',           icon: Pill,         hue: 118 }, { name: 'hospital',      icon: Hospital,     hue: 5   },
  { name: 'heart-pulse',    icon: HeartPulse,   hue: 0   }, { name: 'paw-print',     icon: PawPrint,     hue: 32  },
  { name: 'leaf',           icon: Leaf,         hue: 118 }, { name: 'heart',         icon: Heart,        hue: 350 },
  { name: 'stethoscope',    icon: Stethoscope,  hue: 195 }, { name: 'activity',      icon: Activity,     hue: 118 },
  { name: 'syringe',        icon: Syringe,      hue: 195 }, { name: 'bandage',       icon: Bandage,      hue: 28  },
  { name: 'thermometer',    icon: Thermometer,  hue: 5   }, { name: 'brain',         icon: Brain,        hue: 270 },
  { name: 'glasses',        icon: Glasses,      hue: 210 }, { name: 'ambulance',     icon: Ambulance,    hue: 5   },
  { name: 'briefcase-medical', icon: BriefcaseMedical, hue: 118 }, { name: 'test-tube', icon: TestTube,  hue: 195 },
  { name: 'microscope',     icon: Microscope,   hue: 195 }, { name: 'dna',           icon: Dna,          hue: 118 },
  { name: 'flask-conical',  icon: FlaskConical, hue: 185 }, { name: 'atom',          icon: Atom,         hue: 270 },
  { name: 'footprints',     icon: Footprints,   hue: 32  },
  // Work & Finance
  { name: 'briefcase',      icon: Briefcase,    hue: 215 }, { name: 'banknote',      icon: Banknote,     hue: 118 },
  { name: 'coins',          icon: Coins,        hue: 48  }, { name: 'piggy-bank',    icon: PiggyBank,    hue: 330 },
  { name: 'graduation-cap', icon: GraduationCap,hue: 215 }, { name: 'globe',         icon: Globe,        hue: 200 },
  { name: 'tv',             icon: Tv,           hue: 215 }, { name: 'cpu',           icon: Cpu,          hue: 215 },
  { name: 'calculator',     icon: Calculator,   hue: 210 }, { name: 'trending-up',   icon: TrendingUp,   hue: 118 },
  { name: 'building',       icon: Building,     hue: 215 }, { name: 'building-2',    icon: Building2,    hue: 215 },
  { name: 'vault',          icon: Vault,        hue: 32  }, { name: 'landmark',      icon: Landmark,     hue: 215 },
  { name: 'percent',        icon: Percent,      hue: 48  }, { name: 'dollar-sign',   icon: DollarSign,   hue: 118 },
  { name: 'newspaper',      icon: Newspaper,    hue: 205 }, { name: 'projector',     icon: Projector,    hue: 215 },
  { name: 'phone',          icon: Phone,        hue: 118 }, { name: 'mail',          icon: Mail,         hue: 205 },
  { name: 'contact',        icon: Contact,      hue: 205 },
  // Education
  { name: 'school',         icon: School,       hue: 215 }, { name: 'pencil',        icon: Pencil,       hue: 48  },
  { name: 'book-open',      icon: BookOpen,     hue: 215 }, { name: 'library',       icon: Library,      hue: 215 },
  { name: 'award',          icon: Award,        hue: 48  }, { name: 'notebook',      icon: Notebook,     hue: 215 },
  { name: 'notebook-pen',   icon: NotebookPen,  hue: 215 }, { name: 'eraser',        icon: Eraser,       hue: 330 },
  { name: 'pen',            icon: Pen,          hue: 215 },
  // Travel & Nature
  { name: 'compass',        icon: Compass,      hue: 200 }, { name: 'map-pin',       icon: MapPin,       hue: 5   },
  { name: 'flag',           icon: Flag,         hue: 5   }, { name: 'mountain',      icon: Mountain,     hue: 205 },
  { name: 'tent',           icon: Tent,         hue: 118 }, { name: 'tree-palm',     icon: TreePalm,     hue: 118 },
  { name: 'sun',            icon: Sun,          hue: 48  }, { name: 'moon',          icon: Moon,         hue: 265 },
  { name: 'snowflake',      icon: Snowflake,    hue: 195 }, { name: 'waves',         icon: Waves,        hue: 200 },
  { name: 'flower',         icon: Flower,       hue: 330 }, { name: 'trees',         icon: Trees,        hue: 118 },
  { name: 'tree-deciduous', icon: TreeDeciduous,hue: 118 }, { name: 'tree-pine',     icon: TreePine,     hue: 118 },
  { name: 'clover',         icon: Clover,       hue: 118 }, { name: 'binoculars',    icon: Binoculars,   hue: 205 },
  { name: 'flashlight',     icon: Flashlight,   hue: 48  }, { name: 'satellite',     icon: Satellite,    hue: 215 },
  { name: 'rocket',         icon: Rocket,       hue: 270 }, { name: 'sprout',        icon: Sprout,       hue: 118 },
  // Misc
  { name: 'star',           icon: Star,         hue: 48  }, { name: 'bell',          icon: Bell,         hue: 48  },
  { name: 'key',            icon: Key,          hue: 48  }, { name: 'flame',         icon: Flame,        hue: 20  },
  { name: 'zap',            icon: Zap,          hue: 50  }, { name: 'baby',          icon: Baby,         hue: 330 },
  { name: 'umbrella',       icon: Umbrella,     hue: 200 }, { name: 'wallet',        icon: Wallet,       hue: 118 },
  { name: 'sword',          icon: Sword,        hue: 205 }, { name: 'shield',        icon: Shield,       hue: 205 },
  { name: 'watch',          icon: Watch,        hue: 200 }, { name: 'dog',           icon: Dog,          hue: 32  },
  { name: 'cat',            icon: Cat,          hue: 32  }, { name: 'bird',          icon: Bird,         hue: 200 },
  { name: 'timer',          icon: Timer,        hue: 210 }, { name: 'hourglass',     icon: Hourglass,    hue: 48  },
  { name: 'alarm-clock',    icon: AlarmClock,   hue: 210 }, { name: 'calendar',      icon: Calendar,     hue: 215 },
  { name: 'goal',           icon: Goal,         hue: 118 }, { name: 'milestone',     icon: Milestone,    hue: 200 },
  { name: 'scan-barcode',   icon: ScanBarcode,  hue: 215 }, { name: 'scan-qr-code',  icon: ScanQrCode,   hue: 215 },
  { name: 'file-text',      icon: FileText,     hue: 215 },
];

export function getIconData(iconName?: string): LucideIconData {
  return CATEGORY_ICONS.find(i => i.name === iconName)?.icon ?? Tag;
}

export function getIconHue(iconName?: string): number {
  return CATEGORY_ICONS.find(i => i.name === iconName)?.hue ?? 200;
}

export function getCategoryHue(name?: string): number {
  if (!name) return 200;
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff;
  }
  return h % 360;
}
