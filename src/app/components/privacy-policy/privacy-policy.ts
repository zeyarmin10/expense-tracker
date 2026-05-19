import { Component, inject } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule, TranslateModule, RouterModule],
  templateUrl: './privacy-policy.html',
  styleUrls: ['./privacy-policy.css'],
})
export class PrivacyPolicyComponent {
  private location = inject(Location);

  goBack(): void {
    this.location.back();
  }
}
