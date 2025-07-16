import { Component, Inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { CommonModule } from '@angular/common';
import {
  FontAwesomeModule,
  FaIconLibrary,
} from '@fortawesome/angular-fontawesome';
import {
  faPlusCircle,
  faEdit,
  faTrashAlt,
  faTimes,
  faSave,
  faPencil,
} from '@fortawesome/free-solid-svg-icons';
import {
  faFloppyDisk as farFloppyDisk,
  faTrashCan,
} from '@fortawesome/free-regular-svg-icons';
import { faGoogle } from '@fortawesome/free-brands-svg-icons'; // Google icon ကို import လုပ်ပါ
import { FIREBASE_AUTH } from './firebase.providers';
import { Auth, onAuthStateChanged, signInAnonymously, signInWithCustomToken, signOut } from 'firebase/auth';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FontAwesomeModule, CommonModule],
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App {
  protected readonly title = signal('expense-tracker');
  constructor(library: FaIconLibrary) {
    // သင်သုံးမယ့် icon တွေကို library ထဲ ထည့်ပါ
    library.addIcons(faEdit, faTrashAlt, faPlusCircle, faSave, faTimes, faPencil, farFloppyDisk, faTrashCan, faGoogle);
  }
}
