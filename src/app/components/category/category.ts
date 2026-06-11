import {
  Component,
  OnInit,
  inject,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  Validators,
  ReactiveFormsModule,
  FormControl,
} from '@angular/forms';
import { ServiceICategory, CategoryService } from '../../services/category';
import { Observable, BehaviorSubject, firstValueFrom } from 'rxjs';
import { AuthService } from '../../services/auth';
import { UserProfile } from '../../services/user-data';

import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import {
  faPlus, faEdit, faTrash, faSave, faTimes, faTags, faPen,
} from '@fortawesome/free-solid-svg-icons';
import { faTrashCan } from '@fortawesome/free-regular-svg-icons';
import {
  LucideAngularModule, LucideIconData,
  Utensils, Coffee, Pizza, Wine, CookingPot, Sandwich, Cake, Salad,
  IceCreamCone, Beer, Croissant, Cookie, Donut, Beef, Soup, Fish, Candy, Popcorn, Milk,
  Car, Bus, Plane, TrainFront, Motorbike, Fuel, Bike, Luggage,
  Truck, Ship, Scooter, Anchor, CableCar,
  ShoppingBag, Shirt, Gem, Tag, Gift, Scissors, Backpack, Sparkles,
  ShoppingCart, Store, Handbag, CreditCard, Receipt,
  Gamepad, Film, Music, Book, Dumbbell, Headphones, Palette, Camera,
  Trophy, Medal, Crown, Puzzle, Ticket, PartyPopper, Theater, Dices,
  House, Lightbulb, Droplet, Wrench, Plug, Sofa, Laptop, Smartphone,
  Bed, Refrigerator, Microwave, Fan, WashingMachine, Hammer, DoorClosed, Mailbox,
  Pill, Hospital, HeartPulse, PawPrint, Leaf, Heart, Stethoscope, Activity,
  Syringe, Bandage, Thermometer, Brain, Glasses, Ambulance,
  Briefcase, Banknote, Coins, PiggyBank, GraduationCap, Globe, Tv, Cpu,
  Calculator, TrendingUp, Building, Building2, Vault, Landmark, Percent, DollarSign,
  Star, Bell, Key, Flame, Zap, Baby, Umbrella, Wallet,
  School, Pencil, BookOpen, Library, Award, Compass, MapPin, Flag,
  Mountain, Tent, TreePalm, Sun, Moon, Snowflake, Waves, Flower,
  Sword, Shield, Watch, Dog, Cat, Bird,
} from 'lucide-angular';

import { TranslateService, TranslateModule } from '@ngx-translate/core';
import Swal from 'sweetalert2';
import { CurrentSpaceTitleComponent } from '../common/current-space-title/current-space-title.component';

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  customClass: { popup: 'colored-toast' },
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

@Component({
  selector: 'app-category',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FontAwesomeModule,
    TranslateModule,
    CurrentSpaceTitleComponent,
    LucideAngularModule,
  ],
  templateUrl: './category.html',
  styleUrls: ['./category.css'],
})
export class Category implements OnInit {
  addCategoryForm: FormGroup;
  editingCategoryFormControl: FormControl | null = null;
  editingCategoryId: string | null = null;

  private _categoriesSubject: BehaviorSubject<ServiceICategory[]> =
    new BehaviorSubject<ServiceICategory[]>([]);
  categories$: Observable<ServiceICategory[]> =
    this._categoriesSubject.asObservable();

  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);
  private cdr = inject(ChangeDetectorRef);
  private authService = inject(AuthService);
  private activeSpaceModeKey: string | null = null;

  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
  faSave = faSave;
  faTimes = faTimes;
  faTags = faTags;
  faTrashCan = faTrashCan;
  faPen = faPen;

  readonly categoryIcons: { name: string; icon: LucideIconData }[] = [
    // Food & Drink
    { name: 'utensils',      icon: Utensils    }, { name: 'coffee',       icon: Coffee      },
    { name: 'pizza',         icon: Pizza       }, { name: 'wine',         icon: Wine        },
    { name: 'cooking-pot',   icon: CookingPot  }, { name: 'sandwich',     icon: Sandwich    },
    { name: 'cake',          icon: Cake        }, { name: 'salad',        icon: Salad       },
    { name: 'ice-cream-cone',icon: IceCreamCone}, { name: 'beer',         icon: Beer        },
    { name: 'croissant',     icon: Croissant   }, { name: 'cookie',       icon: Cookie      },
    { name: 'donut',         icon: Donut       }, { name: 'beef',         icon: Beef        },
    { name: 'soup',          icon: Soup        }, { name: 'fish',         icon: Fish        },
    { name: 'candy',         icon: Candy       }, { name: 'popcorn',      icon: Popcorn     },
    { name: 'milk',          icon: Milk        },
    // Transport
    { name: 'car',           icon: Car         }, { name: 'bus',          icon: Bus         },
    { name: 'plane',         icon: Plane       }, { name: 'train-front',  icon: TrainFront  },
    { name: 'motorbike',     icon: Motorbike   }, { name: 'fuel',         icon: Fuel        },
    { name: 'bike',          icon: Bike        }, { name: 'luggage',      icon: Luggage     },
    { name: 'truck',         icon: Truck       }, { name: 'ship',         icon: Ship        },
    { name: 'scooter',       icon: Scooter     }, { name: 'anchor',       icon: Anchor      },
    { name: 'cable-car',     icon: CableCar    },
    // Shopping
    { name: 'shopping-bag',  icon: ShoppingBag }, { name: 'shirt',        icon: Shirt       },
    { name: 'gem',           icon: Gem         }, { name: 'tag',          icon: Tag         },
    { name: 'gift',          icon: Gift        }, { name: 'scissors',     icon: Scissors    },
    { name: 'backpack',      icon: Backpack    }, { name: 'sparkles',     icon: Sparkles    },
    { name: 'shopping-cart', icon: ShoppingCart}, { name: 'store',        icon: Store       },
    { name: 'handbag',       icon: Handbag     }, { name: 'credit-card',  icon: CreditCard  },
    { name: 'receipt',       icon: Receipt     },
    // Entertainment
    { name: 'gamepad',       icon: Gamepad     }, { name: 'film',         icon: Film        },
    { name: 'music',         icon: Music       }, { name: 'book',         icon: Book        },
    { name: 'dumbbell',      icon: Dumbbell    }, { name: 'headphones',   icon: Headphones  },
    { name: 'palette',       icon: Palette     }, { name: 'camera',       icon: Camera      },
    { name: 'trophy',        icon: Trophy      }, { name: 'medal',        icon: Medal       },
    { name: 'crown',         icon: Crown       }, { name: 'puzzle',       icon: Puzzle      },
    { name: 'ticket',        icon: Ticket      }, { name: 'party-popper', icon: PartyPopper },
    { name: 'theater',       icon: Theater     }, { name: 'dices',        icon: Dices       },
    // Home & Utilities
    { name: 'house',         icon: House       }, { name: 'lightbulb',    icon: Lightbulb   },
    { name: 'droplet',       icon: Droplet     }, { name: 'wrench',       icon: Wrench      },
    { name: 'plug',          icon: Plug        }, { name: 'sofa',         icon: Sofa        },
    { name: 'laptop',        icon: Laptop      }, { name: 'smartphone',   icon: Smartphone  },
    { name: 'bed',           icon: Bed         }, { name: 'refrigerator', icon: Refrigerator},
    { name: 'microwave',     icon: Microwave   }, { name: 'fan',          icon: Fan         },
    { name: 'washing-machine',icon: WashingMachine},{ name: 'hammer',     icon: Hammer      },
    { name: 'door-closed',   icon: DoorClosed  }, { name: 'mailbox',      icon: Mailbox     },
    // Health
    { name: 'pill',          icon: Pill        }, { name: 'hospital',     icon: Hospital    },
    { name: 'heart-pulse',   icon: HeartPulse  }, { name: 'paw-print',    icon: PawPrint    },
    { name: 'leaf',          icon: Leaf        }, { name: 'heart',        icon: Heart       },
    { name: 'stethoscope',   icon: Stethoscope }, { name: 'activity',     icon: Activity    },
    { name: 'syringe',       icon: Syringe     }, { name: 'bandage',      icon: Bandage     },
    { name: 'thermometer',   icon: Thermometer }, { name: 'brain',        icon: Brain       },
    { name: 'glasses',       icon: Glasses     }, { name: 'ambulance',    icon: Ambulance   },
    // Work & Finance
    { name: 'briefcase',      icon: Briefcase     }, { name: 'banknote',       icon: Banknote      },
    { name: 'coins',          icon: Coins         }, { name: 'piggy-bank',     icon: PiggyBank     },
    { name: 'graduation-cap', icon: GraduationCap }, { name: 'globe',          icon: Globe         },
    { name: 'tv',             icon: Tv            }, { name: 'cpu',            icon: Cpu           },
    { name: 'calculator',     icon: Calculator    }, { name: 'trending-up',    icon: TrendingUp    },
    { name: 'building',       icon: Building      }, { name: 'building-2',     icon: Building2     },
    { name: 'vault',          icon: Vault         }, { name: 'landmark',       icon: Landmark      },
    { name: 'percent',        icon: Percent       }, { name: 'dollar-sign',    icon: DollarSign    },
    // Education
    { name: 'school',        icon: School      }, { name: 'pencil',       icon: Pencil      },
    { name: 'book-open',     icon: BookOpen    }, { name: 'library',      icon: Library     },
    { name: 'award',         icon: Award       },
    // Travel & Nature
    { name: 'compass',       icon: Compass     }, { name: 'map-pin',      icon: MapPin      },
    { name: 'flag',          icon: Flag        }, { name: 'mountain',     icon: Mountain    },
    { name: 'tent',          icon: Tent        }, { name: 'tree-palm',    icon: TreePalm    },
    { name: 'sun',           icon: Sun         }, { name: 'moon',         icon: Moon        },
    { name: 'snowflake',     icon: Snowflake   }, { name: 'waves',        icon: Waves       },
    { name: 'flower',        icon: Flower      },
    // Misc
    { name: 'star',          icon: Star        }, { name: 'bell',         icon: Bell        },
    { name: 'key',           icon: Key         }, { name: 'flame',        icon: Flame       },
    { name: 'zap',           icon: Zap         }, { name: 'baby',         icon: Baby        },
    { name: 'umbrella',      icon: Umbrella    }, { name: 'wallet',       icon: Wallet      },
    { name: 'sword',         icon: Sword       }, { name: 'shield',       icon: Shield      },
    { name: 'watch',         icon: Watch       }, { name: 'dog',          icon: Dog         },
    { name: 'cat',           icon: Cat         }, { name: 'bird',         icon: Bird        },
  ];

  readonly defaultIcon = Tag;

  selectedAddIcon = 'tag';
  selectedAddIconData: LucideIconData = Tag;
  showAddIconPicker = false;

  selectedEditIcon = 'tag';
  selectedEditIconData: LucideIconData = Tag;
  showEditIconPicker = false;

  getIconData(name?: string): LucideIconData {
    return this.categoryIcons.find(i => i.name === name)?.icon ?? Tag;
  }

  selectAddIcon(name: string): void {
    this.selectedAddIcon = name;
    this.selectedAddIconData = this.getIconData(name);
    this.showAddIconPicker = false;
  }

  selectEditIcon(name: string): void {
    this.selectedEditIcon = name;
    this.selectedEditIconData = this.getIconData(name);
    this.showEditIconPicker = false;
  }

  constructor(private fb: FormBuilder) {
    this.addCategoryForm = this.fb.group({
      name: ['', [Validators.required, Validators.maxLength(30)]],
    });
  }

  ngOnInit(): void {
    this.loadCategories();
    this.authService.userProfile$.subscribe((profile) => {
      const key = this.getSpaceModeKey(profile);
      if (key !== this.activeSpaceModeKey) {
        this.activeSpaceModeKey = key;
        this.editingCategoryId = null;
        this.editingCategoryFormControl = null;
        this.addCategoryForm.reset();
        this.loadCategories();
      }
    });
  }

  private getSpaceModeKey(profile: UserProfile | null): string {
    if (!profile) return 'none';
    const type = profile.currentSpaceType || profile.accountType || 'personal';
    const id = profile.currentSpaceId || profile.groupId || profile.personalSpaceId || profile.uid;
    return `${type}:${id}`;
  }

  public async loadCategories(): Promise<void> {
    try {
      const categories = await firstValueFrom(
        this.categoryService.getCategories()
      );
      this._categoriesSubject.next(categories);
    } catch (error) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        (error as any).message ||
        this.translateService.instant('DATA_LOAD_ERROR')
      );
      console.error('Error loading categories:', error);
    }
  }

  async onAddSubmit(): Promise<void> {
    if (this._categoriesSubject.value.length >= 100) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_LIMIT_REACHED')
      );
      return;
    }

    if (this.addCategoryForm.invalid) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_NAME_REQUIRED')
      );
      return;
    }

    const categoryName = this.addCategoryForm.value.name.trim();

    const categories = this._categoriesSubject.value;
    const isDuplicate = categories.some(
      (category) => category.name.toLowerCase() === categoryName.toLowerCase()
    );

    if (isDuplicate) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_ALREADY_EXISTS')
      );
      return;
    }

    try {
      await this.categoryService.addCategory(categoryName, this.selectedAddIcon);
      Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_ADDED_SUCCESS') });
      this.addCategoryForm.reset();
      this.selectedAddIcon = 'tag';
      this.selectedAddIconData = Tag;
      this.showAddIconPicker = false;
      await this.loadCategories();
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('DATA_SAVE_ERROR')
      );
      console.error('Category add error:', error);
    }
  }

  startEdit(category: ServiceICategory): void {
    if (this.editingCategoryId !== null) {
      return;
    }
    this.editingCategoryId = category.id!;
    this.editingCategoryFormControl = new FormControl(
      category.name,
      [Validators.required, Validators.maxLength(30)]
    );
    this.selectedEditIcon = category.icon || 'tag';
    this.selectedEditIconData = this.getIconData(category.icon);
    this.showEditIconPicker = false;
  }

  cancelEdit(): void {
    this.editingCategoryId = null;
    this.editingCategoryFormControl = null;
    this.showEditIconPicker = false;
  }

  async onUpdateInline(
    categoryId: string
  ): Promise<void> {
    if (
      this.editingCategoryFormControl &&
      this.editingCategoryFormControl.invalid
    ) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_NAME_REQUIRED')
      );
      return;
    }
    if (!this.editingCategoryFormControl || !categoryId) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        this.translateService.instant('CATEGORY_ERROR_UPDATE_INVALID')
      );
      return;
    }

    const newCategoryName = (this.editingCategoryFormControl.value || '').trim();
    try {
      await this.categoryService.updateCategory(
        categoryId,
        newCategoryName,
        this.selectedEditIcon
      );
      Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_SUCCESS_UPDATED') });
      this.cancelEdit();
      this.loadCategories(); // Reload to reflect changes
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message || this.translateService.instant('CATEGORY_ERROR_UPDATE')
      );
      console.error('Error updating category:', error);
    }
  }

  async onDelete(categoryId: string): Promise<void> {
    try {
      const isUsed = await this.categoryService.isCategoryUsedInExpenses(
        categoryId
      );

      if (isUsed) {
        this.showErrorModal(
          this.translateService.instant('DELETE_CATEGORY_ERROR_TITLE'),
          this.translateService.instant('CATEGORY_IN_USE_ERROR')
        );
        return;
      }

      const confirmMsg = await firstValueFrom(
        this.translateService.get('CONFIRM_DELETE_CATEGORY')
      );

      Swal.fire({
        title: this.translateService.instant('CONFIRM_DELETE_TITLE'),
        text: confirmMsg,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonText: this.translateService.instant('DELETE_BUTTON'),
        cancelButtonText: this.translateService.instant('CANCEL_BUTTON'),
        reverseButtons: true
      }).then(async (result) => {
        if (result.isConfirmed) {
          try {
            await this.categoryService.deleteCategory(categoryId);
            Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_DELETED_SUCCESS') });
            if (this.editingCategoryId === categoryId) {
              this.cancelEdit();
            }
            await this.loadCategories();
          } catch (error: any) {
            this.showErrorModal(
              this.translateService.instant('ERROR_TITLE'),
              error.message ||
              this.translateService.instant('DATA_DELETE_ERROR')
            );
          }
        }
      });
    } catch (error: any) {
      this.showErrorModal(
        this.translateService.instant('ERROR_TITLE'),
        error.message ||
        this.translateService.instant('FAILED_CHECK_CATEGORY_USAGE')
      );
    }
  }

  showErrorModal(title: string, message: string): void {
    Swal.fire({
      icon: 'error',
      title: title,
      text: message,
      confirmButtonText: this.translateService.instant('OK_BUTTON')
    });
  }
}
