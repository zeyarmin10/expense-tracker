import { Component, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { FontAwesomeModule, FaIconLibrary } from '@fortawesome/angular-fontawesome';
import { faEdit, faTrashAlt, faPlusCircle, faSave, faTimes } from '@fortawesome/free-solid-svg-icons';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, FontAwesomeModule],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('expense-tracker');
  constructor(library: FaIconLibrary) {
    // သင်သုံးမယ့် icon တွေကို library ထဲ ထည့်ပါ
    library.addIcons(faEdit, faTrashAlt, faPlusCircle, faSave, faTimes);
  }
}
