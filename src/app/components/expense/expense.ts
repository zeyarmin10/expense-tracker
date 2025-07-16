// src/app/expense/expense.component.ts
import { Component, OnInit, OnDestroy, Inject, ChangeDetectorRef } from '@angular/core'; // ChangeDetectorRef, NgZone များကို ဖယ်ရှားထားပါသည်
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { onAuthStateChanged, Auth, signInAnonymously } from 'firebase/auth';
import { ref, push, onValue, update, remove, Database, DataSnapshot } from 'firebase/database';
import { FIREBASE_AUTH, FIREBASE_DATABASE } from '../../firebase.providers';
import { environment } from '../../../environments/environment.development'; // environment ကို import လုပ်ပါ
import { IExpense } from '../../models/expense';
import { FontAwesomeModule } from '@fortawesome/angular-fontawesome';


@Component({
  selector: 'app-expense',
  standalone: true,
  imports: [CommonModule, FormsModule, FontAwesomeModule],
  templateUrl: './expense.html',
})


export class Expense implements OnInit, OnDestroy {
  Object = Object; // Make Object accessible in the template for Object.keys()

  userId: string | null = null;
  private unsubscribeFromAuth!: () => void;
  private unsubscribeFromExpenses!: () => void;

  loading: boolean = true;
  isSaving: boolean = false; // Add a flag to prevent double saving

  newExpense: IExpense = {
    category: '',
    itemName: '',
    quantity: 1,
    price: 0,
    date: new Date().toISOString().substring(0, 10), // Pre-fill with today's date
  };

  categories: string[] = [
    'အစားအသောက်', // Food
    'သယ်ယူပို့ဆောင်ရေး', // Transportation
    'အိမ်ငှားခ', // Rent
    ' utility', // Utilities
    'ဖျော်ဖြေရေး', // Entertainment
    'ပညာရေး', // Education
    'ကျန်းမာရေး', // Health
    'အခြား', // Other
  ];

  expenses: IExpense[] = []; // List of expenses fetched from Firebase

  constructor(
    @Inject(FIREBASE_AUTH) private auth: Auth,
    @Inject(FIREBASE_DATABASE) private db: Database,
    private cdr: ChangeDetectorRef // ChangeDetectorRef ကို ပြန်လည်ထည့်သွင်းပါ
  ) { }

  async ngOnInit(): Promise<void> {
    console.log('Expense Component: ngOnInit started. Initial loading state:', this.loading);

    try {
      // Listen for Firebase Authentication state changes
      this.unsubscribeFromAuth = onAuthStateChanged(this.auth, async (user) => {
        if (user) {
          this.userId = user.uid;
          console.log('Firebase user authenticated:', this.userId);
          // Once authenticated, start listening for expenses
          this.listenForExpenses();
        } else {
          try {
            // If no user, sign in anonymously for local development and production
            console.log('No user found, attempting anonymous sign-in...');
            await signInAnonymously(this.auth);
            console.log('Signed in anonymously successfully.');
            // After successful anonymous sign-in, onAuthStateChanged will fire again with a user.
            // So, listenForExpenses will be called in the 'if (user)' block.
          } catch (authError: any) {
            console.error('Firebase authentication error:', authError);
            alert('အကောင့်ဝင်ရာတွင် အမှားအယွင်းရှိပါသည်။'); // Error signing in
            this.loading = false; // Set loading to false if authentication completely fails
            console.log('Authentication failed, setting loading to false.');
            this.cdr.detectChanges(); // Force UI update
          }
        }
      });
    } catch (error) {
      console.error('Firebase initialization error:', error);
      alert('Firebase စတင်ရာတွင် အမှားအယွင်းရှိပါသည်။'); // Error initializing Firebase
      this.loading = false; // Always set loading to false if initialization fails
      console.log('Initialization error, setting loading to false.');
      this.cdr.detectChanges(); // Force UI update
    }
  }

  ngOnDestroy(): void {
    // Unsubscribe from Firebase listeners to prevent memory leaks
    if (this.unsubscribeFromAuth) {
      this.unsubscribeFromAuth();
    }
    if (this.db && this.userId && this.unsubscribeFromExpenses) {
      this.unsubscribeFromExpenses();
    }
  }

  // Listen for real-time updates to expenses from Firebase Realtime Database
  private listenForExpenses(): void {
    if (!this.db || !this.userId) {
      console.warn('Realtime Database or user ID not available for listening to expenses. Setting loading to false.');
      this.loading = false;
      this.cdr.detectChanges(); // Force UI update
      return;
    }

    console.log('Starting to listen for expenses...');
    // Use projectId from environment as appId for Realtime Database path
    const appId = environment.firebaseConfig.projectId;
    const expensesRef = ref(
      this.db,
      `artifacts/${appId}/users/${this.userId}/expenses`
    );

    // onValue returns an unsubscribe function
    this.unsubscribeFromExpenses = onValue(
      expensesRef,
      (snapshot: DataSnapshot) => {
        this.expenses = []; // Clear current expenses
        snapshot.forEach((childSnapshot) => {
          const expenseData = childSnapshot.val();
          this.expenses.push({
            id: childSnapshot.key, // Firebase key as ID
            ...expenseData,
          } as IExpense);
        });
        this.loading = false; // Data loaded, set loading to false
        console.log('Expenses updated from Firebase Realtime Database. Expenses count:', this.expenses.length, 'Loading state:', this.loading);
        this.cdr.detectChanges(); // Force UI update after data is loaded and loading state is false
      },
      (error) => {
        console.error('Error fetching expenses from Firebase Realtime Database:', error);
        alert('အသုံးစရိတ်များ ရယူရာတွင် အမှားအယွင်းရှိပါသည်။'); // Error fetching expenses
        this.loading = false; // Set loading to false on error
        console.log('Error fetching expenses, setting loading to false.');
        this.cdr.detectChanges(); // Force UI update
      }
    );
  }

  // Handle form submission (Add new expense)
  async onSubmit(): Promise<void> {
    // Prevent multiple submissions if already saving
    if (this.isSaving) {
      console.log('Submission already in progress. Please wait.');
      return;
    }

    // Basic validation
    if (
      !this.newExpense.category ||
      !this.newExpense.itemName ||
      isNaN(this.newExpense.quantity) ||
      isNaN(this.newExpense.price) ||
      this.newExpense.quantity <= 0 ||
      this.newExpense.price < 0 ||
      !this.newExpense.date
    ) {
      alert('ကျေးဇူးပြု၍ အချက်အလက်အားလုံးကို မှန်ကန်စွာဖြည့်စွက်ပါ။'); // Please fill in all details correctly.
      return;
    }

    if (!this.db || !this.userId) {
      alert('Firebase ဒေတာဘေ့စ် မရရှိနိုင်ပါ။ ကျေးဇူပြု၍ ပြန်လည်စမ်းပါ။'); // Firebase database not available
      return;
    }

    this.isSaving = true; // Set saving flag to true

    try {
      // Calculate total and add userId
      const expenseToSave: IExpense = {
        ...this.newExpense,
        total: this.newExpense.quantity * this.newExpense.price,
        userId: this.userId,
      };

      const appId = environment.firebaseConfig.projectId;
      const expensesRef = ref(
        this.db,
        `artifacts/${appId}/users/${this.userId}/expenses`
      );
      await push(expensesRef, expenseToSave); // Add new expense to Firebase

      console.log('အသုံးစရိတ် အောင်မြင်စွာ ထည့်သွင်းပြီးပါပြီ:', expenseToSave); // Expense added successfully

      // Reset the form, pre-filling today's date for the next entry
      this.newExpense = {
        category: '',
        itemName: '',
        quantity: 1,
        price: 0,
        date: new Date().toISOString().substring(0, 10),
      };
      // onValue listener will handle UI update automatically with NgZone.

    } catch (error) {
      console.error('Error adding document to Firebase Realtime Database:', error);
      alert('အသုံးစရိတ်ထည့်သွင်းရာတွင် အမှားအယွင်းရှိပါသည်။'); // Error adding expense
    } finally {
      this.isSaving = false; // Reset saving flag
      this.cdr.detectChanges(); // Force UI update after saving is complete
    }
  }

  // Enable editing for an expense
  editExpense(expense: IExpense): void {
    // Store a deep copy of the original expense for cancellation
    expense.originalExpense = JSON.parse(JSON.stringify(expense));
    expense.isEditing = true;
    this.cdr.detectChanges(); // Force UI update after setting isEditing to true
  }

  // Cancel editing and revert to original data
  cancelEdit(expense: IExpense): void {
    if (expense.originalExpense) {
      // Restore original values by copying properties
      Object.assign(expense, expense.originalExpense);
      delete expense.originalExpense; // Clean up original expense data
    }
    expense.isEditing = false;
    this.cdr.detectChanges(); // Force UI update after setting isEditing to false
  }

  // Save edited expense to Firebase Realtime Database
  async saveExpense(expense: IExpense): Promise<void> {
    // Prevent multiple saves if already saving
    if (this.isSaving) {
      console.log('Save operation already in progress. Please wait.');
      return;
    }

    if (!this.db || !this.userId || !expense.id) {
      alert('အချက်အလက် မပြည့်စုံပါ သို့မဟုတ် Firebase မရရှိနိုင်ပါ။'); // Incomplete data or Firebase not available.
      return;
    }

    // Basic validation for edited fields
    if (
      !expense.category ||
      !expense.itemName ||
      isNaN(expense.quantity) ||
      isNaN(expense.price) ||
      expense.quantity <= 0 ||
      expense.price < 0 ||
      !expense.date
    ) {
      alert('ကျေးဇူးပြု၍ အချက်အလက်အားလုံးကို မှန်ကန်စွာဖြည့်စွက်ပါ။'); // Please fill in all details correctly.
      return;
    }

    this.isSaving = true; // Set saving flag to true

    try {
      const appId = environment.firebaseConfig.projectId;
      const expenseRefPath = `artifacts/${appId}/users/${this.userId}/expenses/${expense.id}`;
      const expenseItemRef = ref(this.db, expenseRefPath);

      // Create an object with only the fields to update, excluding `isEditing` and `originalExpense`
      const updatedData: Partial<IExpense> = {
        category: expense.category,
        itemName: expense.itemName,
        quantity: expense.quantity,
        price: expense.price,
        date: expense.date,
        total: expense.quantity * expense.price, // Recalculate total
      };

      await update(expenseItemRef, updatedData); // Use update for existing entries

      expense.isEditing = false;
      delete expense.originalExpense; // Clean up original expense data
      console.log('အသုံးစရိတ်ကို Firebase Realtime Database တွင် ပြင်ဆင်ပြီးပါပြီ:', expense); // Expense updated in Firebase
    } catch (error) {
      console.error('Error updating document in Firebase Realtime Database:', error);
      alert('အသုံးစရိတ်ပြင်ဆင်ရာတွင် အမှားအယွင်းရှိပါသည်။'); // Error updating expense
    } finally {
      this.isSaving = false; // Reset saving flag
      this.cdr.detectChanges(); // Force UI update after saving is complete
    }
  }

  // Delete expense from Firebase Realtime Database
  async deleteExpense(id: string | undefined): Promise<void> {
    if (!this.db || !this.userId || !id) {
      alert('အချက်အလက် မပြည့်စုံပါ သို့မဟုတ် Firebase မရရှိနိုင်ပါ။'); // Incomplete data or Firebase not available.
      return;
    }

    // Using browser's confirm for simplicity, but consider custom modal for production
    if (!confirm('ဤအသုံးစရိတ်ကို ဖျက်လိုပါသလား။')) {
      return;
    }

    try {
      const appId = environment.firebaseConfig.projectId;
      const expenseRefPath = `artifacts/${appId}/users/${this.userId}/expenses/${id}`;
      const expenseItemRef = ref(this.db, expenseRefPath);
      await remove(expenseItemRef); // Use remove for deleting entries
      console.log('အသုံးစရိတ်ကို Firebase Realtime Database မှ ဖျက်ပြီးပါပြီ:', id); // Expense deleted from Firebase
    } catch (error) {
      console.error('Error deleting document from Firebase Realtime Database:', error);
      alert('အသုံးစရိတ်ဖျက်ရာတွင် အမှားအယွင်းရှိပါသည်။'); // Error deleting expense
    }
  }
}