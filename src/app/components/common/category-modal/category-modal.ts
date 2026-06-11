import { Component, ElementRef, EventEmitter, OnInit, Output, ViewChild, inject, HostListener } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { CategoryService } from '../../../services/category';
import { CommonModule } from '@angular/common';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { faSave, faTimes, faPlus, faEdit, faTrash, faTags, faPen } from '@fortawesome/free-solid-svg-icons';
import { faTrashCan } from '@fortawesome/free-regular-svg-icons';
import { FaIconComponent } from "@fortawesome/angular-fontawesome";
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
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { ServiceICategory } from '../../../services/category';
import Swal from 'sweetalert2';

declare const bootstrap: any;

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
  selector: 'app-category-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TranslateModule, FaIconComponent, LucideAngularModule],
  templateUrl: './category-modal.html',
  styleUrls: ['./category-modal.css']
})
export class CategoryModalComponent implements OnInit {
  @Output() categoryAdded = new EventEmitter<void>();

  categoryForm: FormGroup;
  categoryService = inject(CategoryService);
  translateService = inject(TranslateService);

  categories: ServiceICategory[] = [];
  isEditMode = false;
  editingCategoryId: string | null = null;
  isModalOpen = false;
  deletingStates: { [key: string]: boolean } = {};

  private bsModal: any;

  private categories$ = new BehaviorSubject<ServiceICategory[]>([]);

  faSave = faSave;
  faTimes = faTimes;
  faPlus = faPlus;
  faEdit = faEdit;
  faTrash = faTrash;
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

  selectedIcon = 'tag';
  selectedIconData: LucideIconData = Tag;
  showIconPicker = false;

  getIconData(name?: string): LucideIconData {
    return this.categoryIcons.find(i => i.name === name)?.icon ?? Tag;
  }

  selectIcon(name: string): void {
    this.selectedIcon = name;
    this.selectedIconData = this.getIconData(name);
    this.showIconPicker = false;
  }

  @HostListener('window:popstate', ['$event'])
  onPopState(event: PopStateEvent): void {
    if (this.isModalOpen) {
      this.bsModal.hide();
    }
  }

  constructor(private fb: FormBuilder) {
    this.categoryForm = this.fb.group({
      name: ['', Validators.required]
    });
  }

  ngOnInit(): void {
    this.categories$.subscribe(categories => {
      this.categories = categories;
    });
  }

  private async initializeModal(): Promise<void> {
    return new Promise((resolve) => {
      if (!this.bsModal) {
        const modalElement = document.getElementById('categoryModal');
        if (modalElement) {
          this.bsModal = new bootstrap.Modal(modalElement);
          modalElement.addEventListener('hidden.bs.modal', () => {
            this.isModalOpen = false;
            this.resetForm();
          });
        }
      }
      resolve();
    });
  }

  async open(): Promise<void> {
    await this.initializeModal();
    await this.loadCategories();
    this.resetForm();


    const modalElement = document.getElementById('categoryModal');
    if (modalElement) {
      // When the modal is fully hidden, update the flag.
      modalElement.addEventListener('hidden.bs.modal', () => {
        this.isModalOpen = false;
      }, { once: true });

      modalElement.addEventListener('shown.bs.modal', () => {
        const inputElement = document.getElementById('catNameInput');
        if (inputElement) {
          inputElement.focus();
        }
      }, { once: true });

      this.bsModal = new bootstrap.Modal(modalElement);

    // Push state to browser history and update flag before showing
      history.pushState(null, '');
      this.isModalOpen = true;
      this.bsModal.show();
    }
  }

  closeModal(): void {
    if (this.isModalOpen) {
      history.back();
    } else {
      this.bsModal.hide();
    }
  }

  private async loadCategories(): Promise<void> {
    try {
      const categories = await firstValueFrom(this.categoryService.getCategories());
      this.categories$.next(categories);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  }

  onEdit(category: ServiceICategory): void {
    this.isEditMode = true;
    this.editingCategoryId = category.id!;
    this.categoryForm.setValue({ name: category.name });
    this.selectedIcon = category.icon || 'tag';
    this.selectedIconData = this.getIconData(category.icon);
    this.showIconPicker = false;
  }

  resetForm(): void {
    this.isEditMode = false;
    this.editingCategoryId = null;
    this.categoryForm.reset();
    this.selectedIcon = 'tag';
    this.selectedIconData = Tag;
    this.showIconPicker = false;
  }

  isDeleting(categoryId: string): boolean {
    return this.deletingStates[categoryId];
  }

  async onSave(): Promise<void> {
    if (this.categoryForm.invalid) {
      return;
    }

    const categoryName = this.categoryForm.value.name;

    try {
      if (this.isEditMode && this.editingCategoryId) {
        await this.categoryService.updateCategory(this.editingCategoryId, categoryName, this.selectedIcon);
        Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_SUCCESS_UPDATED') });
      } else {
        await this.categoryService.addCategory(categoryName, this.selectedIcon);
        Toast.fire({ icon: 'success', title: this.translateService.instant('CATEGORY_ADDED_SUCCESS') });
      }
      await this.loadCategories();
      this.categoryAdded.emit();
      this.resetForm();
      this.closeModal();
    } catch (error) {
      console.error('Error saving category:', error);
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
              this.resetForm();
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
