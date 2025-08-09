import { Component, OnInit, inject } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import {
  FormBuilder,
  FormGroup,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { Observable, of, map, firstValueFrom } from 'rxjs';
import { switchMap, tap, catchError } from 'rxjs/operators';
import { AuthService } from '../../services/auth';
import { UserDataService, UserProfile } from '../../services/user-data';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';
import { faSave, faUserCircle } from '@fortawesome/free-solid-svg-icons';
import { updateProfile } from '@angular/fire/auth';
import { User } from '@angular/fire/auth';

@Component({
  selector: 'app-user-profile',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    TranslateModule,
    FontAwesomeModule,
  ],
  providers: [DatePipe],
  templateUrl: './user-profile.html',
  styleUrls: ['./user-profile.css'],
})
export class UserProfileComponent implements OnInit {
  private authService = inject(AuthService);
  private userDataService = inject(UserDataService);
  private fb = inject(FormBuilder);
  private translate = inject(TranslateService);
  private datePipe = inject(DatePipe);

  userProfileForm: FormGroup;
  userDisplayData$: Observable<{
    email: string | null;
    createdAt: string | null;
  } | null>;
  userPhotoUrl$: Observable<string | null>;

  errorMessage: string | null = null;
  successMessage: string | null = null;

  faSave = faSave;
  faUserCircle = faUserCircle;

  imageLoadError: boolean = false;

  constructor() {
    this.userProfileForm = this.fb.group({
      displayName: ['', Validators.maxLength(50)],
    });

    this.userDisplayData$ = this.authService.currentUser$.pipe(
      switchMap((user) => {
        if (user && user.uid) {
          return this.userDataService.getUserProfile(user.uid).pipe(
            tap((profile) => {
              const currentDisplayName =
                profile?.displayName || user.displayName || '';
              this.userProfileForm.patchValue({
                displayName: currentDisplayName,
              });

              if (!profile) {
                this.userDataService
                  .createUserProfile({
                    uid: user.uid,
                    email: user.email || '',
                    displayName: user.displayName || '',
                    createdAt:
                      user.metadata.creationTime || new Date().toISOString(),
                  })
                  .catch((err) =>
                    console.error('Error creating initial user profile:', err)
                  );
              }
            }),
            map((profile) => {
              // CORRECTED: Use the 'user' object from the outer switchMap
              const email = profile?.email || user.email || 'N/A';
              const createdAt = profile?.createdAt
                ? this.datePipe.transform(profile.createdAt, 'mediumDate')
                : user.metadata.creationTime
                ? this.datePipe.transform(
                    user.metadata.creationTime,
                    'mediumDate'
                  )
                : 'N/A';

              return { email, createdAt };
            }),
            catchError((err) => {
              console.error('Error fetching user profile data:', err);
              this.errorMessage = this.translate.instant('PROFILE_FETCH_ERROR');
              return of(null);
            })
          );
        }
        this.userProfileForm.patchValue({ displayName: '' });
        return of(null);
      })
    );

    this.userPhotoUrl$ = this.authService.currentUser$.pipe(
      map((user) => {
        this.imageLoadError = false;
        if (
          user?.photoURL &&
          typeof user.photoURL === 'string' &&
          user.photoURL.length > 0
        ) {
          return user.photoURL;
        }
        return null;
      })
    );
  }

  ngOnInit(): void {
    // No specific initialization needed beyond constructor setup
  }

  onImageError(): void {
    console.log('Profile image failed to load. Displaying default icon.');
    this.imageLoadError = true;
  }

  async onSubmit(): Promise<void> {
    this.errorMessage = null;
    this.successMessage = null;

    if (this.userProfileForm.valid && this.userProfileForm.dirty) {
      const currentUser = await firstValueFrom(this.authService.currentUser$);

      if (currentUser && currentUser.uid) {
        const displayName = this.userProfileForm.get('displayName')?.value;
        try {
          if (
            currentUser.displayName !== displayName &&
            displayName !== null &&
            displayName !== undefined
          ) {
            await updateProfile(currentUser, { displayName: displayName });
          }

          await this.userDataService.updateUserProfile(currentUser.uid, {
            displayName: displayName,
          });

          this.successMessage = this.translate.instant(
            'PROFILE_UPDATE_SUCCESS'
          );
          this.userProfileForm.markAsPristine();
        } catch (error: any) {
          console.error('Error updating profile:', error);
          this.errorMessage =
            error.message || this.translate.instant('PROFILE_UPDATE_ERROR');
        }
      } else {
        this.errorMessage = this.translate.instant('AUTH_ERROR_PROFILE_UPDATE');
      }
    } else {
      if (this.userProfileForm.invalid) {
        this.errorMessage = this.translate.instant('INVALID_FORM_PROFILE');
      } else if (!this.userProfileForm.dirty) {
        this.errorMessage = this.translate.instant('NO_CHANGES_TO_SAVE');
      }
    }
  }
}
