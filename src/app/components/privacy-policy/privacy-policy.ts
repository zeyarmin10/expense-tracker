import { Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';
import { ArrowLeft, LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterModule, LucideAngularModule],
  templateUrl: './privacy-policy.html',
  styleUrls: ['./privacy-policy.css'],
})
export class PrivacyPolicyComponent {
  private location = inject(Location);
  readonly iconArrowLeft = ArrowLeft;

  goBack(): void {
    this.location.back();
  }
}
