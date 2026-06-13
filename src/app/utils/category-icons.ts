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
  Timer, Hourglass, AlarmClock, Calendar, Goal, Milestone, ScanBarcode, ScanQrCode,
} from 'lucide-angular';

export const CATEGORY_ICONS: { name: string; icon: LucideIconData }[] = [
  // Food & Drink
  { name: 'utensils',       icon: Utensils     }, { name: 'coffee',        icon: Coffee       },
  { name: 'pizza',          icon: Pizza        }, { name: 'wine',          icon: Wine         },
  { name: 'cooking-pot',    icon: CookingPot   }, { name: 'sandwich',      icon: Sandwich     },
  { name: 'cake',           icon: Cake         }, { name: 'salad',         icon: Salad        },
  { name: 'ice-cream-cone', icon: IceCreamCone }, { name: 'beer',          icon: Beer         },
  { name: 'croissant',      icon: Croissant    }, { name: 'cookie',        icon: Cookie       },
  { name: 'donut',          icon: Donut        }, { name: 'beef',          icon: Beef         },
  { name: 'soup',           icon: Soup         }, { name: 'fish',          icon: Fish         },
  { name: 'candy',          icon: Candy        }, { name: 'popcorn',       icon: Popcorn      },
  { name: 'milk',           icon: Milk         }, { name: 'apple',         icon: Apple        },
  { name: 'banana',         icon: Banana       }, { name: 'cherry',        icon: Cherry       },
  { name: 'grape',          icon: Grape        }, { name: 'carrot',        icon: Carrot       },
  { name: 'leafy-green',    icon: LeafyGreen   }, { name: 'wheat',         icon: Wheat        },
  { name: 'egg',            icon: Egg          }, { name: 'egg-fried',     icon: EggFried     },
  { name: 'chef-hat',       icon: ChefHat      }, { name: 'cup-soda',      icon: CupSoda      },
  { name: 'cake-slice',     icon: CakeSlice    }, { name: 'dessert',       icon: Dessert      },
  { name: 'vegan',          icon: Vegan        },
  // Transport
  { name: 'car',            icon: Car          }, { name: 'bus',           icon: Bus          },
  { name: 'plane',          icon: Plane        }, { name: 'train-front',   icon: TrainFront   },
  { name: 'motorbike',      icon: Motorbike    }, { name: 'fuel',          icon: Fuel         },
  { name: 'bike',           icon: Bike         }, { name: 'luggage',       icon: Luggage      },
  { name: 'truck',          icon: Truck        }, { name: 'ship',          icon: Ship         },
  { name: 'scooter',        icon: Scooter      }, { name: 'anchor',        icon: Anchor       },
  { name: 'cable-car',      icon: CableCar     }, { name: 'route',         icon: Route        },
  { name: 'navigation',     icon: Navigation   }, { name: 'map-pinned',    icon: MapPinned    },
  { name: 'forklift',       icon: Forklift     },
  // Shopping
  { name: 'shopping-bag',   icon: ShoppingBag  }, { name: 'shirt',         icon: Shirt        },
  { name: 'gem',            icon: Gem          }, { name: 'tag',           icon: Tag          },
  { name: 'gift',           icon: Gift         }, { name: 'scissors',      icon: Scissors     },
  { name: 'backpack',       icon: Backpack     }, { name: 'sparkles',      icon: Sparkles     },
  { name: 'shopping-cart',  icon: ShoppingCart }, { name: 'store',         icon: Store        },
  { name: 'handbag',        icon: Handbag      }, { name: 'credit-card',   icon: CreditCard   },
  { name: 'receipt',        icon: Receipt      }, { name: 'diamond',       icon: Diamond      },
  { name: 'wallet-cards',   icon: WalletCards  }, { name: 'barcode',       icon: Barcode      },
  { name: 'nfc',            icon: Nfc          }, { name: 'sticker',       icon: Sticker      },
  { name: 'stamp',          icon: Stamp        }, { name: 'badge',         icon: Badge        },
  // Entertainment
  { name: 'gamepad',        icon: Gamepad      }, { name: 'film',          icon: Film         },
  { name: 'music',          icon: Music        }, { name: 'book',          icon: Book         },
  { name: 'dumbbell',       icon: Dumbbell     }, { name: 'headphones',    icon: Headphones   },
  { name: 'palette',        icon: Palette      }, { name: 'camera',        icon: Camera       },
  { name: 'trophy',         icon: Trophy       }, { name: 'medal',         icon: Medal        },
  { name: 'crown',          icon: Crown        }, { name: 'puzzle',        icon: Puzzle       },
  { name: 'ticket',         icon: Ticket       }, { name: 'party-popper',  icon: PartyPopper  },
  { name: 'theater',        icon: Theater      }, { name: 'dices',         icon: Dices        },
  { name: 'guitar',         icon: Guitar       }, { name: 'drum',          icon: Drum         },
  { name: 'mic-vocal',      icon: MicVocal     }, { name: 'drama',         icon: Drama        },
  { name: 'clapperboard',   icon: Clapperboard }, { name: 'album',         icon: Album        },
  { name: 'cassette-tape',  icon: CassetteTape }, { name: 'volleyball',    icon: Volleyball   },
  // Home & Utilities
  { name: 'house',          icon: House        }, { name: 'lightbulb',     icon: Lightbulb    },
  { name: 'droplet',        icon: Droplet      }, { name: 'wrench',        icon: Wrench       },
  { name: 'plug',           icon: Plug         }, { name: 'sofa',          icon: Sofa         },
  { name: 'laptop',         icon: Laptop       }, { name: 'smartphone',    icon: Smartphone   },
  { name: 'bed',            icon: Bed          }, { name: 'refrigerator',  icon: Refrigerator },
  { name: 'microwave',      icon: Microwave    }, { name: 'fan',           icon: Fan          },
  { name: 'washing-machine',icon: WashingMachine},{ name: 'hammer',        icon: Hammer       },
  { name: 'door-closed',    icon: DoorClosed   }, { name: 'mailbox',       icon: Mailbox      },
  { name: 'air-vent',       icon: AirVent      }, { name: 'armchair',      icon: Armchair     },
  { name: 'bath',           icon: Bath         }, { name: 'castle',        icon: Castle       },
  { name: 'hotel',          icon: Hotel        }, { name: 'factory',       icon: Factory      },
  { name: 'church',         icon: Church       }, { name: 'drill',         icon: Drill        },
  { name: 'paint-roller',   icon: PaintRoller  }, { name: 'paint-bucket',  icon: PaintBucket  },
  { name: 'paintbrush',     icon: Paintbrush   }, { name: 'recycle',       icon: Recycle      },
  { name: 'hard-drive',     icon: HardDrive    }, { name: 'circuit-board', icon: CircuitBoard },
  { name: 'database',       icon: Database     }, { name: 'wifi',          icon: Wifi         },
  { name: 'cog',            icon: Cog          },
  // Health
  { name: 'pill',           icon: Pill         }, { name: 'hospital',      icon: Hospital     },
  { name: 'heart-pulse',    icon: HeartPulse   }, { name: 'paw-print',     icon: PawPrint     },
  { name: 'leaf',           icon: Leaf         }, { name: 'heart',         icon: Heart        },
  { name: 'stethoscope',    icon: Stethoscope  }, { name: 'activity',      icon: Activity     },
  { name: 'syringe',        icon: Syringe      }, { name: 'bandage',       icon: Bandage      },
  { name: 'thermometer',    icon: Thermometer  }, { name: 'brain',         icon: Brain        },
  { name: 'glasses',        icon: Glasses      }, { name: 'ambulance',     icon: Ambulance    },
  { name: 'briefcase-medical', icon: BriefcaseMedical }, { name: 'test-tube', icon: TestTube },
  { name: 'microscope',     icon: Microscope   }, { name: 'dna',           icon: Dna          },
  { name: 'flask-conical',  icon: FlaskConical }, { name: 'atom',          icon: Atom         },
  { name: 'footprints',     icon: Footprints   },
  // Work & Finance
  { name: 'briefcase',      icon: Briefcase    }, { name: 'banknote',      icon: Banknote     },
  { name: 'coins',          icon: Coins        }, { name: 'piggy-bank',    icon: PiggyBank    },
  { name: 'graduation-cap', icon: GraduationCap}, { name: 'globe',         icon: Globe        },
  { name: 'tv',             icon: Tv           }, { name: 'cpu',           icon: Cpu          },
  { name: 'calculator',     icon: Calculator   }, { name: 'trending-up',   icon: TrendingUp   },
  { name: 'building',       icon: Building     }, { name: 'building-2',    icon: Building2    },
  { name: 'vault',          icon: Vault        }, { name: 'landmark',      icon: Landmark     },
  { name: 'percent',        icon: Percent      }, { name: 'dollar-sign',   icon: DollarSign   },
  { name: 'newspaper',      icon: Newspaper    }, { name: 'projector',     icon: Projector    },
  { name: 'phone',          icon: Phone        }, { name: 'mail',          icon: Mail         },
  { name: 'contact',        icon: Contact      },
  // Education
  { name: 'school',         icon: School       }, { name: 'pencil',        icon: Pencil       },
  { name: 'book-open',      icon: BookOpen     }, { name: 'library',       icon: Library      },
  { name: 'award',          icon: Award        }, { name: 'notebook',      icon: Notebook     },
  { name: 'notebook-pen',   icon: NotebookPen  }, { name: 'eraser',        icon: Eraser       },
  { name: 'pen',            icon: Pen          },
  // Travel & Nature
  { name: 'compass',        icon: Compass      }, { name: 'map-pin',       icon: MapPin       },
  { name: 'flag',           icon: Flag         }, { name: 'mountain',      icon: Mountain     },
  { name: 'tent',           icon: Tent         }, { name: 'tree-palm',     icon: TreePalm     },
  { name: 'sun',            icon: Sun          }, { name: 'moon',          icon: Moon         },
  { name: 'snowflake',      icon: Snowflake    }, { name: 'waves',         icon: Waves        },
  { name: 'flower',         icon: Flower       }, { name: 'trees',         icon: Trees        },
  { name: 'tree-deciduous', icon: TreeDeciduous}, { name: 'tree-pine',     icon: TreePine     },
  { name: 'clover',         icon: Clover       }, { name: 'binoculars',    icon: Binoculars   },
  { name: 'flashlight',     icon: Flashlight   }, { name: 'satellite',     icon: Satellite    },
  { name: 'rocket',         icon: Rocket       }, { name: 'sprout',        icon: Sprout       },
  // Misc
  { name: 'star',           icon: Star         }, { name: 'bell',          icon: Bell         },
  { name: 'key',            icon: Key          }, { name: 'flame',         icon: Flame        },
  { name: 'zap',            icon: Zap          }, { name: 'baby',          icon: Baby         },
  { name: 'umbrella',       icon: Umbrella     }, { name: 'wallet',        icon: Wallet       },
  { name: 'sword',          icon: Sword        }, { name: 'shield',        icon: Shield       },
  { name: 'watch',          icon: Watch        }, { name: 'dog',           icon: Dog          },
  { name: 'cat',            icon: Cat          }, { name: 'bird',          icon: Bird         },
  { name: 'timer',          icon: Timer        }, { name: 'hourglass',     icon: Hourglass    },
  { name: 'alarm-clock',    icon: AlarmClock   }, { name: 'calendar',      icon: Calendar     },
  { name: 'goal',           icon: Goal         }, { name: 'milestone',     icon: Milestone    },
  { name: 'scan-barcode',   icon: ScanBarcode  }, { name: 'scan-qr-code',  icon: ScanQrCode   },
];

export function getIconData(iconName?: string): LucideIconData {
  return CATEGORY_ICONS.find(i => i.name === iconName)?.icon ?? Tag;
}

export function getCategoryHue(name?: string): number {
  if (!name) return 200;
  let h = 5381;
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff;
  }
  return h % 360;
}
