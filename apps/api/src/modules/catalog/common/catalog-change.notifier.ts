import { Injectable } from '@nestjs/common';
import { type Observable, Subject } from 'rxjs';

@Injectable()
export class CatalogChangeNotifier {
  private readonly subject = new Subject<void>();

  readonly changes$: Observable<void> = this.subject.asObservable();

  notify(): void {
    this.subject.next();
  }
}
