import type { ReportComponent, ReportContent } from './report-component';

/**
 * Decorator (abstract): keeps a reference to the wrapped component and delegates to it.
 * Concrete decorators call `super.generateContent()` first and then add their layer.
 * They must return NEW objects: the content of the wrapped component is never mutated.
 */
export abstract class ReportDecorator implements ReportComponent {
  protected readonly wrapped: ReportComponent;

  constructor(wrapped: ReportComponent) {
    this.wrapped = wrapped;
  }

  generateContent(): ReportContent {
    return this.wrapped.generateContent();
  }
}
