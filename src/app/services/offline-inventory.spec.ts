import { TestBed } from '@angular/core/testing';
import { Database } from '@angular/fire/database';
import { Capacitor } from '@capacitor/core';
import { BehaviorSubject, of, Subject } from 'rxjs';
import { AuthService } from './auth';
import { IncomeService } from './income';
import { NetworkService } from './network.service';
import { OfflineOperation, OfflineStoreService } from './offline-store.service';
import { OfflineSyncService } from './offline-sync.service';
import { PersonalOfflineDataService } from './personal-offline-data.service';
import { SharedOfflineDataService } from './shared-offline-data.service';
import { SpaceDataService } from './space-data.service';
import { SpaceSwitchLoadingService } from './space-switch-loading.service';
import { UserDataService } from './user-data';
import { TEST_PROVIDERS } from '../testing/test-providers';

describe('offline product sales', () => {
  const profile: any = { uid: 'seller', currency: 'MMK', accountType: 'personal' };
  let income: IncomeService;
  let personal: jasmine.SpyObj<PersonalOfflineDataService>;

  beforeEach(() => {
    personal = jasmine.createSpyObj('PersonalOfflineDataService', [
      'isOfflinePersonal', 'read', 'write', 'createRecordId',
    ]);
    personal.isOfflinePersonal.and.returnValue(true);
    personal.createRecordId.and.returnValue('inc_offline');
    personal.write.and.resolveTo();
    const shared = jasmine.createSpyObj('SharedOfflineDataService', ['isOfflineShared']);
    shared.isOfflineShared.and.returnValue(false);
    TestBed.configureTestingModule({
      providers: [
        IncomeService,
        { provide: Database, useValue: {} },
        { provide: AuthService, useValue: { userProfile$: of(profile) } },
        { provide: UserDataService, useValue: {} },
        { provide: SpaceDataService, useValue: {} },
        { provide: SpaceSwitchLoadingService, useValue: {} },
        { provide: PersonalOfflineDataService, useValue: personal },
        { provide: SharedOfflineDataService, useValue: shared },
        { provide: NetworkService, useValue: { isOnline$: new BehaviorSubject(false) } },
      ],
    });
    income = TestBed.inject(IncomeService);
  });

  it('queues a locally valid sale instead of requiring a connection', async () => {
    personal.read.and.callFake((_profile, collection): Promise<any> => Promise.resolve(
      collection === 'expenses'
        ? { purchase: { currency: 'MMK', productId: 'p1', quantity: 2, totalCost: 200 } }
        : {},
    ));

    const result = await income.addIncome({
      date: '2026-09-27', currency: 'MMK', amount: 150, isProductSale: true,
      productId: 'p1', quantity: 1, unitPrice: 150,
    });

    expect(result).toBe('queued');
    expect(personal.write).toHaveBeenCalledWith(
      profile, 'incomes', 'stockSaleSet', 'inc_offline',
      jasmine.objectContaining({ productId: 'p1', quantity: 1, isProductSale: true }),
    );
  });

  it('rejects an offline sale that exceeds cached stock', async () => {
    personal.read.and.resolveTo({});

    await expectAsync(income.addIncome({
      date: '2026-09-27', currency: 'MMK', amount: 150, isProductSale: true,
      productId: 'p1', quantity: 1, unitPrice: 150,
    })).toBeRejectedWithError('STOCK_INSUFFICIENT');
    expect(personal.write).not.toHaveBeenCalled();
  });

  it('queues a product sale edit using stock excluding the sale being edited', async () => {
    personal.read.and.callFake((_profile, collection): Promise<any> => Promise.resolve(
      collection === 'expenses'
        ? { purchase: { currency: 'MMK', productId: 'p1', quantity: 2, totalCost: 200 } }
        : { sale1: { date: '2026-09-27', currency: 'MMK', amount: 150, isProductSale: true,
          productId: 'p1', quantity: 1, unitPrice: 150 } },
    ));

    const result = await income.updateIncome('sale1', { quantity: 2, amount: 300 });

    expect(result).toBe('queued');
    expect(personal.write).toHaveBeenCalledWith(
      profile, 'incomes', 'stockSaleUpdate', 'sale1',
      jasmine.objectContaining({ quantity: 2, amount: 300 }),
    );
  });
});

describe('offline sale operation coalescing', () => {
  it('replays only the final edited quantity of an unsynced sale', async () => {
    spyOn(Capacitor, 'isNativePlatform').and.returnValue(true);
    const operations: OfflineOperation[] = [];
    const store = jasmine.createSpyObj<OfflineStoreService>('OfflineStoreService', [
      'patchRecord', 'enqueue', 'pendingOperations', 'createId', 'nextOperationTimestamp',
    ]);
    store.patchRecord.and.resolveTo();
    store.pendingOperations.and.callFake(async () => [...operations]);
    store.enqueue.and.callFake(async (operation) => {
      const index = operations.findIndex(existing => existing.id === operation.id);
      if (index >= 0) operations[index] = operation;
      else operations.push(operation);
    });
    store.createId.and.returnValue('op1');
    store.nextOperationTimestamp.and.returnValue(1);
    TestBed.configureTestingModule({
      providers: [
        PersonalOfflineDataService,
        { provide: NetworkService, useValue: { isOnline$: new BehaviorSubject(false) } },
        { provide: OfflineStoreService, useValue: store },
      ],
    });
    const personal = TestBed.inject(PersonalOfflineDataService);
    const profile: any = { uid: 'seller', currency: 'MMK' };

    await personal.write(profile, 'incomes', 'stockSaleSet', 'sale1', { quantity: 2, isProductSale: true });
    await personal.write(profile, 'incomes', 'stockSaleUpdate', 'sale1', { quantity: 1 });

    expect(operations.length).toBe(1);
    expect(operations[0].kind).toBe('stockSaleSet');
    expect(operations[0].payload?.['quantity']).toBe(1);
  });
});

describe('offline sale sync', () => {
  let operation: OfflineOperation;
  let queue: OfflineOperation[];
  let store: jasmine.SpyObj<OfflineStoreService>;
  let income: jasmine.SpyObj<IncomeService>;
  let sync: OfflineSyncService;

  beforeEach(() => {
    operation = {
      id: 'op1', kind: 'stockSaleSet', path: 'space_data/shop/incomes/sale1',
      payload: { currency: 'MMK', isProductSale: true, productId: 'p1', quantity: 1 },
      createdAt: 1, attempts: 0,
    };
    queue = [operation];
    store = jasmine.createSpyObj<OfflineStoreService>('OfflineStoreService', [
      'pendingOperations', 'removeOperation', 'markFailed',
    ]);
    store.pendingOperations.and.callFake(async () => [...queue]);
    store.removeOperation.and.callFake(async id => { queue = queue.filter(item => item.id !== id); });
    store.markFailed.and.callFake(async (_operation, error) => {
      queue[0].lastError = error instanceof Error ? error.message : String(error);
    });
    (store as any).queueChanged$ = new Subject<void>();
    income = jasmine.createSpyObj<IncomeService>('IncomeService', ['applyQueuedProductSale']);
    TestBed.configureTestingModule({
      providers: [
        ...TEST_PROVIDERS,
        OfflineSyncService,
        { provide: NetworkService, useValue: { isOnline$: new BehaviorSubject(true) } },
        { provide: OfflineStoreService, useValue: store },
        { provide: IncomeService, useValue: income },
      ],
    });
    sync = TestBed.inject(OfflineSyncService);
  });

  it('replays a queued sale through stock validation before removing it', async () => {
    income.applyQueuedProductSale.and.resolveTo();

    await sync.sync();

    expect(income.applyQueuedProductSale).toHaveBeenCalledWith(operation);
    expect(store.removeOperation).toHaveBeenCalledWith(operation.id);
    expect(sync.pendingCount$.value).toBe(0);
  });

  it('keeps an insufficient-stock sale pending as a visible conflict', async () => {
    income.applyQueuedProductSale.and.rejectWith(new Error('SYNC_CONFLICT:STOCK_INSUFFICIENT'));

    await sync.sync();

    expect(store.removeOperation).not.toHaveBeenCalled();
    expect(sync.pendingCount$.value).toBe(1);
    expect(sync.conflictCount$.value).toBe(1);
  });

  it('processes an edit queued while the first sale is being uploaded', async () => {
    let finishFirst!: () => void;
    const firstUpload = new Promise<void>(resolve => { finishFirst = resolve; });
    income.applyQueuedProductSale.and.returnValues(firstUpload, Promise.resolve());

    const syncing = sync.sync();
    await Promise.resolve();
    expect(store.replayingOperationId).toBe(operation.id);

    const edit: OfflineOperation = {
      id: 'op2', kind: 'stockSaleUpdate', path: operation.path,
      payload: { quantity: 2 }, createdAt: 2, attempts: 0,
    };
    queue.push(edit);
    finishFirst();
    await syncing;

    expect(income.applyQueuedProductSale).toHaveBeenCalledWith(edit);
    expect(queue).toEqual([]);
    expect(store.replayingOperationId).toBeNull();
  });
});
