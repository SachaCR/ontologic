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
      amount: 250,
      currency: "EUR",
    },
  })
    .addStep(checkAccountBalance)
    .addStep(checkReceiverIsValid)
    .addStep(checkAmlRisk)
    .parallelize({ name: "Checks", steps: [check1, check2, check3] })
    .addStep(clean)
    .addStep(createSepaTransfer);

  workflow.onChanges((event) => console.log("EVENT:", event));

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

const check1: WorkflowStep<AfterAml, AfterAml> = {
  name: "check1",
  handler: async (sepaRequest) => {
    await sleep(3000);
    return sepaRequest;
  },
};

const check2: WorkflowStep<AfterAml, AfterAml> = {
  name: "check2",
  handler: async (sepaRequest) => {
    await sleep(1000);
    return sepaRequest;
  },
};

const check3: WorkflowStep<AfterAml, AfterAml> = {
  name: "check3",
  handler: async (sepaRequest) => {
    await sleep(2000);
    return sepaRequest;
  },
};

const clean: WorkflowStep<
  { check1: AfterAml; check2: AfterAml; check3: AfterAml },
  AfterAml
> = {
  name: "Clean",
  // handler: async (results) => {
  handler: async (results: {
    check1: AfterAml;
    check2: AfterAml;
    check3: AfterAml;
  }) => {
    await sleep(2000);
    const test = results as { check1: AfterAml };
    return test.check1;
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

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
