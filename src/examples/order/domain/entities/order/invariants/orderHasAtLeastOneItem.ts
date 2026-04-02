import { BaseDomainInvariant } from "../../../../../..";
import { OrderState } from "../order.entity";

export const orderHasAtLeastOneItemInvariant = new BaseDomainInvariant<OrderState>(
  "Order Has At Least One Item",
  (state) => {
    return state.items.length >= 1;
  }
);
