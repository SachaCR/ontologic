import { randomUUID } from "node:crypto";

import {
  InMemoryWorkflowStateRepository,
  WorkflowBuilder,
  WorkflowStep,
} from "../../workflows";

async function main() {
  const repository = new InMemoryWorkflowStateRepository();

  const workflow = new WorkflowBuilder<SepaPaymentRequest>({
    id: randomUUID(),
    name: "SEPA Payment",
    input: {
      accountId: "ACC-001",
      receiverIban: "FR7630006000011234567890189",
      amount: 25000,
      currency: "EUR",
    },
  })
    .addStep(checkAccountBalance)
    .addStep(checkReceiverIsValid)
    .addStep(checkAmlRisk)
    .addStep(createSepaTransfer);

  try {
    const transfer = await workflow.execute(repository);
    console.log("Transfer:", transfer);
  } catch (err: unknown) {
    console.log(err);
  }

  console.log("STATUS:", workflow.status());
  console.log("Step results:");

  for (const [step, value] of workflow.results()) {
    console.log(` - ${step}:`, value);
  }
}

const checkAccountBalance: WorkflowStep<
  SepaPaymentRequest,
  SepaPaymentRequest
> = {
  name: "Check Account Balance",
  handler: async (sepaRequest) => {
    if (sepaRequest.amount > 3000) {
      throw new Error("Not enough funds");
    }

    return sepaRequest;
  },
};

const checkReceiverIsValid: WorkflowStep<SepaPaymentRequest, AfterReceiver> = {
  name: "Check Receiver Is Valid",
  handler: async (sepaRequest) => {
    if (sepaRequest.receiverIban !== "FR7630006000011234567890189") {
      throw new Error("Invalid receiver");
    }

    return {
      ...sepaRequest,
      receiverName: "John Doe",
    };
  },
};

const checkAmlRisk: WorkflowStep<AfterReceiver, AfterAml> = {
  name: "Check AML Risk",
  handler: async (sepaRequest) => {
    if (sepaRequest.receiverName !== "John Doe") {
      throw new Error("It seems that this person is politically exposed");
    }

    return { ...sepaRequest, amlRiskScore: 0.12, amlCleared: true };
  },
};

const createSepaTransfer: WorkflowStep<AfterAml, SepaTransfer> = {
  name: "Create SEPA Transfer",
  handler: async (sepaRequest) => {
    return {
      transferId: `SEPA-${randomUUID()}`,
      from: sepaRequest.accountId,
      to: sepaRequest.receiverName,
      IBAN: sepaRequest.receiverIban,
      status: "pending",
      executedAt: new Date().toISOString(),
    };
  },
};

interface SepaPaymentRequest {
  accountId: string;
  receiverIban: string;
  amount: number;
  currency: "EUR";
}

interface ReceiverCheck {
  receiverName: string;
}

interface AmlCheck {
  amlRiskScore: number;
  amlCleared: boolean;
}

interface SepaTransfer {
  transferId: string;
  status: "pending" | "rejected";
  executedAt: string;
  from: string;
  to: string;
  IBAN: string;
}

type AfterReceiver = SepaPaymentRequest & ReceiverCheck;
type AfterAml = AfterReceiver & AmlCheck;

main().catch(console.error);
