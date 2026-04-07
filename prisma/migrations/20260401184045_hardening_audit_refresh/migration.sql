-- CreateTable
CREATE TABLE "patient" (
    "patient_id" SERIAL NOT NULL,
    "family_id" INTEGER,
    "patient_type" INTEGER NOT NULL DEFAULT 1,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT,
    "date_of_birth" TIMESTAMP(3),
    "gender" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "pedo" BOOLEAN NOT NULL DEFAULT false,
    "absent" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "photo" BYTEA,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patient_pkey" PRIMARY KEY ("patient_id")
);

-- CreateTable
CREATE TABLE "address" (
    "address_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "street" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country_id" INTEGER,

    CONSTRAINT "address_pkey" PRIMARY KEY ("address_id")
);

-- CreateTable
CREATE TABLE "dentist" (
    "dentist_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "specialty" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "division_id" INTEGER,

    CONSTRAINT "dentist_pkey" PRIMARY KEY ("dentist_id")
);

-- CreateTable
CREATE TABLE "operator" (
    "operator_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "operator_pkey" PRIMARY KEY ("operator_id")
);

-- CreateTable
CREATE TABLE "division" (
    "division_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "division_pkey" PRIMARY KEY ("division_id")
);

-- CreateTable
CREATE TABLE "business" (
    "business_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "logo" BYTEA,

    CONSTRAINT "business_pkey" PRIMARY KEY ("business_id")
);

-- CreateTable
CREATE TABLE "section" (
    "section_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sort_order" INTEGER,

    CONSTRAINT "section_pkey" PRIMARY KEY ("section_id")
);

-- CreateTable
CREATE TABLE "operation" (
    "operation_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "section_id" INTEGER NOT NULL,
    "graph_id" INTEGER,
    "price" DECIMAL(65,30) NOT NULL,
    "foreign_price" DECIMAL(65,30),
    "color" INTEGER,
    "color_ex" INTEGER,
    "p_order" INTEGER,

    CONSTRAINT "operation_pkey" PRIMARY KEY ("operation_id")
);

-- CreateTable
CREATE TABLE "treatment" (
    "treatment_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "operation_id" INTEGER NOT NULL,
    "dentist_id" INTEGER,
    "tooth_id" INTEGER,
    "tooth2_id" INTEGER,
    "surfaces" TEXT,
    "proc_status_id" INTEGER NOT NULL,
    "date_time" TIMESTAMP(3) NOT NULL,
    "net_price" DECIMAL(65,30) NOT NULL,
    "foreign_net_price" DECIMAL(65,30),
    "exchange_rate" DECIMAL(65,30),
    "plan" TEXT,
    "notes" TEXT,

    CONSTRAINT "treatment_pkey" PRIMARY KEY ("treatment_id")
);

-- CreateTable
CREATE TABLE "proc_status" (
    "proc_status_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,

    CONSTRAINT "proc_status_pkey" PRIMARY KEY ("proc_status_id")
);

-- CreateTable
CREATE TABLE "teeth" (
    "teeth_id" INTEGER NOT NULL,
    "tooth_number" INTEGER NOT NULL,
    "name" TEXT,
    "pedo" BOOLEAN NOT NULL DEFAULT false,
    "quadrant_id" INTEGER,

    CONSTRAINT "teeth_pkey" PRIMARY KEY ("teeth_id")
);

-- CreateTable
CREATE TABLE "tooth_memo" (
    "tooth_memo_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "tooth_id" INTEGER NOT NULL,
    "memo" TEXT NOT NULL,

    CONSTRAINT "tooth_memo_pkey" PRIMARY KEY ("tooth_memo_id")
);

-- CreateTable
CREATE TABLE "appointment" (
    "appointment_id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "new_patient_id" INTEGER,
    "dentist_id" INTEGER NOT NULL,
    "appointment_type_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "start_time" TIMESTAMP(3),
    "end_time" TIMESTAMP(3),
    "duration" INTEGER,
    "notes" TEXT,
    "status" INTEGER,

    CONSTRAINT "appointment_pkey" PRIMARY KEY ("appointment_id")
);

-- CreateTable
CREATE TABLE "appointment_type" (
    "appointment_type_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "color" INTEGER,
    "duration" INTEGER,

    CONSTRAINT "appointment_type_pkey" PRIMARY KEY ("appointment_type_id")
);

-- CreateTable
CREATE TABLE "waiting_room" (
    "waiting_room_id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "new_patient_id" INTEGER,
    "arrival_time" TIMESTAMP(3) NOT NULL,
    "status" INTEGER,

    CONSTRAINT "waiting_room_pkey" PRIMARY KEY ("waiting_room_id")
);

-- CreateTable
CREATE TABLE "account" (
    "account_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "account_type_id" INTEGER NOT NULL,
    "parent_account_id" INTEGER,
    "balance" DECIMAL(65,30),
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "account_pkey" PRIMARY KEY ("account_id")
);

-- CreateTable
CREATE TABLE "account_type" (
    "account_type_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "account_type_pkey" PRIMARY KEY ("account_type_id")
);

-- CreateTable
CREATE TABLE "credit" (
    "credit_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "credit_type" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "foreign_amount" DECIMAL(65,30),
    "exchange_rate" DECIMAL(65,30),
    "currency_code" TEXT,
    "status" INTEGER NOT NULL,
    "date_time" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "voucher_id" INTEGER,

    CONSTRAINT "credit_pkey" PRIMARY KEY ("credit_id")
);

-- CreateTable
CREATE TABLE "distribution" (
    "distribution_id" SERIAL NOT NULL,
    "credit_id" INTEGER NOT NULL,
    "treatment_id" INTEGER,
    "patient_id" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,

    CONSTRAINT "distribution_pkey" PRIMARY KEY ("distribution_id")
);

-- CreateTable
CREATE TABLE "voucher" (
    "voucher_id" SERIAL NOT NULL,
    "voucher_type_id" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "description" TEXT,
    "account_id" INTEGER,

    CONSTRAINT "voucher_pkey" PRIMARY KEY ("voucher_id")
);

-- CreateTable
CREATE TABLE "voucher_type" (
    "voucher_type_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "voucher_type_pkey" PRIMARY KEY ("voucher_type_id")
);

-- CreateTable
CREATE TABLE "money_code" (
    "money_code_id" SERIAL NOT NULL,
    "form_id" INTEGER NOT NULL,
    "class" INTEGER NOT NULL,
    "code" TEXT,
    "description" TEXT,

    CONSTRAINT "money_code_pkey" PRIMARY KEY ("money_code_id")
);

-- CreateTable
CREATE TABLE "prescription" (
    "prescription_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "dentist_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,

    CONSTRAINT "prescription_pkey" PRIMARY KEY ("prescription_id")
);

-- CreateTable
CREATE TABLE "prescription_detail" (
    "prescription_detail_id" SERIAL NOT NULL,
    "prescription_id" INTEGER NOT NULL,
    "medicine_id" INTEGER,
    "dosage" TEXT,
    "instructions" TEXT,
    "quantity" INTEGER,

    CONSTRAINT "prescription_detail_pkey" PRIMARY KEY ("prescription_detail_id")
);

-- CreateTable
CREATE TABLE "medicine" (
    "medicine_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "default_dosage" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "medicine_pkey" PRIMARY KEY ("medicine_id")
);

-- CreateTable
CREATE TABLE "recall" (
    "recall_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "interval_days" INTEGER,
    "description" TEXT,

    CONSTRAINT "recall_pkey" PRIMARY KEY ("recall_id")
);

-- CreateTable
CREATE TABLE "patient_recall" (
    "patient_recall_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "recall_id" INTEGER NOT NULL,
    "due_date" TIMESTAMP(3),
    "completed_date" TIMESTAMP(3),
    "status" INTEGER,

    CONSTRAINT "patient_recall_pkey" PRIMARY KEY ("patient_recall_id")
);

-- CreateTable
CREATE TABLE "recall_operation" (
    "recall_operation_id" SERIAL NOT NULL,
    "recall_id" INTEGER NOT NULL,
    "operation_id" INTEGER NOT NULL,

    CONSTRAINT "recall_operation_pkey" PRIMARY KEY ("recall_operation_id")
);

-- CreateTable
CREATE TABLE "patient_disease" (
    "patient_disease_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "disease_id" INTEGER,

    CONSTRAINT "patient_disease_pkey" PRIMARY KEY ("patient_disease_id")
);

-- CreateTable
CREATE TABLE "patient_allergy" (
    "patient_allergy_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "allergy_name" TEXT,

    CONSTRAINT "patient_allergy_pkey" PRIMARY KEY ("patient_allergy_id")
);

-- CreateTable
CREATE TABLE "disease" (
    "disease_id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "dis_sort_order" INTEGER,

    CONSTRAINT "disease_pkey" PRIMARY KEY ("disease_id")
);

-- CreateTable
CREATE TABLE "xray" (
    "xray_id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "xray_type_id" INTEGER,
    "date" TIMESTAMP(3) NOT NULL,
    "file_path" TEXT,
    "image_data" TEXT,
    "mime_type" TEXT,
    "tooth_id" INTEGER,
    "notes" TEXT,

    CONSTRAINT "xray_pkey" PRIMARY KEY ("xray_id")
);

-- CreateTable
CREATE TABLE "xray_type" (
    "xray_type_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "xray_type_pkey" PRIMARY KEY ("xray_type_id")
);

-- CreateTable
CREATE TABLE "graph" (
    "graph_id" INTEGER NOT NULL,
    "name" TEXT,
    "symbol_data" TEXT,

    CONSTRAINT "graph_pkey" PRIMARY KEY ("graph_id")
);

-- CreateTable
CREATE TABLE "extra_symbol" (
    "extra_symbol_id" SERIAL NOT NULL,
    "name" TEXT,
    "symbol_data" TEXT,

    CONSTRAINT "extra_symbol_pkey" PRIMARY KEY ("extra_symbol_id")
);

-- CreateTable
CREATE TABLE "phone_book" (
    "phone_book_id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "mobile" TEXT,
    "email" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "account_id" INTEGER,

    CONSTRAINT "phone_book_pkey" PRIMARY KEY ("phone_book_id")
);

-- CreateTable
CREATE TABLE "country" (
    "country_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,

    CONSTRAINT "country_pkey" PRIMARY KEY ("country_id")
);

-- CreateTable
CREATE TABLE "pcf_tree" (
    "pcf_tree_id" SERIAL NOT NULL,
    "parent_pcf_tree_id" INTEGER,
    "name" TEXT NOT NULL,
    "field_order" INTEGER,

    CONSTRAINT "pcf_tree_pkey" PRIMARY KEY ("pcf_tree_id")
);

-- CreateTable
CREATE TABLE "pcf_value" (
    "pcf_value_id" SERIAL NOT NULL,
    "pcf_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "value" TEXT,

    CONSTRAINT "pcf_value_pkey" PRIMARY KEY ("pcf_value_id")
);

-- CreateTable
CREATE TABLE "global_setting" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "global_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personal_setting" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT,

    CONSTRAINT "personal_setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user" (
    "user_id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT,
    "role" TEXT NOT NULL DEFAULT 'user',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "order_and_position" (
    "id" SERIAL NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "order_and_position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "month" (
    "month_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "month_pkey" PRIMARY KEY ("month_id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "auditLogId" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipAddress" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("auditLogId")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" SERIAL NOT NULL,
    "token" TEXT NOT NULL,
    "userId" INTEGER NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patient_family_id_idx" ON "patient"("family_id");

-- CreateIndex
CREATE INDEX "patient_first_name_middle_name_idx" ON "patient"("first_name", "middle_name");

-- CreateIndex
CREATE INDEX "operation_section_id_idx" ON "operation"("section_id");

-- CreateIndex
CREATE INDEX "treatment_patient_id_idx" ON "treatment"("patient_id");

-- CreateIndex
CREATE INDEX "treatment_operation_id_idx" ON "treatment"("operation_id");

-- CreateIndex
CREATE INDEX "treatment_proc_status_id_idx" ON "treatment"("proc_status_id");

-- CreateIndex
CREATE INDEX "treatment_date_time_idx" ON "treatment"("date_time");

-- CreateIndex
CREATE INDEX "credit_patient_id_idx" ON "credit"("patient_id");

-- CreateIndex
CREATE INDEX "credit_credit_type_idx" ON "credit"("credit_type");

-- CreateIndex
CREATE INDEX "distribution_credit_id_idx" ON "distribution"("credit_id");

-- CreateIndex
CREATE INDEX "distribution_treatment_id_idx" ON "distribution"("treatment_id");

-- CreateIndex
CREATE INDEX "distribution_patient_id_idx" ON "distribution"("patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "global_setting_key_key" ON "global_setting"("key");

-- CreateIndex
CREATE UNIQUE INDEX "user_username_key" ON "user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_key" ON "refresh_token"("token");

-- CreateIndex
CREATE INDEX "refresh_token_token_idx" ON "refresh_token"("token");

-- CreateIndex
CREATE INDEX "refresh_token_userId_idx" ON "refresh_token"("userId");

-- AddForeignKey
ALTER TABLE "patient" ADD CONSTRAINT "patient_family_id_fkey" FOREIGN KEY ("family_id") REFERENCES "patient"("patient_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address" ADD CONSTRAINT "address_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "address" ADD CONSTRAINT "address_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "country"("country_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dentist" ADD CONSTRAINT "dentist_division_id_fkey" FOREIGN KEY ("division_id") REFERENCES "division"("division_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation" ADD CONSTRAINT "operation_section_id_fkey" FOREIGN KEY ("section_id") REFERENCES "section"("section_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operation" ADD CONSTRAINT "operation_graph_id_fkey" FOREIGN KEY ("graph_id") REFERENCES "graph"("graph_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operation"("operation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentist"("dentist_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "treatment" ADD CONSTRAINT "treatment_proc_status_id_fkey" FOREIGN KEY ("proc_status_id") REFERENCES "proc_status"("proc_status_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tooth_memo" ADD CONSTRAINT "tooth_memo_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tooth_memo" ADD CONSTRAINT "tooth_memo_tooth_id_fkey" FOREIGN KEY ("tooth_id") REFERENCES "teeth"("teeth_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentist"("dentist_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment" ADD CONSTRAINT "appointment_appointment_type_id_fkey" FOREIGN KEY ("appointment_type_id") REFERENCES "appointment_type"("appointment_type_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "waiting_room" ADD CONSTRAINT "waiting_room_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_account_type_id_fkey" FOREIGN KEY ("account_type_id") REFERENCES "account_type"("account_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_parent_account_id_fkey" FOREIGN KEY ("parent_account_id") REFERENCES "account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit" ADD CONSTRAINT "credit_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit" ADD CONSTRAINT "credit_voucher_id_fkey" FOREIGN KEY ("voucher_id") REFERENCES "voucher"("voucher_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_credit_id_fkey" FOREIGN KEY ("credit_id") REFERENCES "credit"("credit_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_treatment_id_fkey" FOREIGN KEY ("treatment_id") REFERENCES "treatment"("treatment_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "distribution" ADD CONSTRAINT "distribution_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher" ADD CONSTRAINT "voucher_voucher_type_id_fkey" FOREIGN KEY ("voucher_type_id") REFERENCES "voucher_type"("voucher_type_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "voucher" ADD CONSTRAINT "voucher_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription" ADD CONSTRAINT "prescription_dentist_id_fkey" FOREIGN KEY ("dentist_id") REFERENCES "dentist"("dentist_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_detail" ADD CONSTRAINT "prescription_detail_prescription_id_fkey" FOREIGN KEY ("prescription_id") REFERENCES "prescription"("prescription_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescription_detail" ADD CONSTRAINT "prescription_detail_medicine_id_fkey" FOREIGN KEY ("medicine_id") REFERENCES "medicine"("medicine_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_recall" ADD CONSTRAINT "patient_recall_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_recall" ADD CONSTRAINT "patient_recall_recall_id_fkey" FOREIGN KEY ("recall_id") REFERENCES "recall"("recall_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_operation" ADD CONSTRAINT "recall_operation_recall_id_fkey" FOREIGN KEY ("recall_id") REFERENCES "recall"("recall_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recall_operation" ADD CONSTRAINT "recall_operation_operation_id_fkey" FOREIGN KEY ("operation_id") REFERENCES "operation"("operation_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_disease" ADD CONSTRAINT "patient_disease_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_disease" ADD CONSTRAINT "patient_disease_disease_id_fkey" FOREIGN KEY ("disease_id") REFERENCES "disease"("disease_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_allergy" ADD CONSTRAINT "patient_allergy_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xray" ADD CONSTRAINT "xray_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "xray" ADD CONSTRAINT "xray_xray_type_id_fkey" FOREIGN KEY ("xray_type_id") REFERENCES "xray_type"("xray_type_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_book" ADD CONSTRAINT "phone_book_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_book" ADD CONSTRAINT "phone_book_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "account"("account_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pcf_tree" ADD CONSTRAINT "pcf_tree_parent_pcf_tree_id_fkey" FOREIGN KEY ("parent_pcf_tree_id") REFERENCES "pcf_tree"("pcf_tree_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pcf_value" ADD CONSTRAINT "pcf_value_pcf_id_fkey" FOREIGN KEY ("pcf_id") REFERENCES "pcf_tree"("pcf_tree_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pcf_value" ADD CONSTRAINT "pcf_value_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patient"("patient_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personal_setting" ADD CONSTRAINT "personal_setting_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;
