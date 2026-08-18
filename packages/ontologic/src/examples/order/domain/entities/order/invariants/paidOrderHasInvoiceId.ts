import { BaseDomainInvariant } from "../../../../../..";
import { OrderState } from "../order.entity";

export const paidOrderHasInvoiceIdInvariant = new BaseDomainInvariant<OrderState>(
  "Paid Order Has Invoice Id",
  (state) => {
    if (state.status === "PAID") {
      return state.invoiceId !== undefined;
    }
    return true;
  }
);
