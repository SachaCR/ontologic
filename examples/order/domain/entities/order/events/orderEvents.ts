import { OrderCreated } from "./orderCreated.event";
import { OrderItemAdded } from "./orderItemAdded.event";
import { OrderItemRemoved } from "./orderItemRemoved.event";
import { VoucherApplied } from "./voucherApplied.event";
import { OrderPlaced } from "./orderPlaced.event";
import { OrderPaid } from "./orderPaid.event";

export type OrderEvent =
  | OrderCreated
  | OrderItemAdded
  | OrderItemRemoved
  | VoucherApplied
  | OrderPlaced
  | OrderPaid;
