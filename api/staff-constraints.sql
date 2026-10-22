ALTER TABLE "staff" ADD CONSTRAINT "staff_left_check" CHECK ((status = 'LEFT') = (left_on IS NOT NULL));
ALTER TABLE "staff" ADD CONSTRAINT "staff_left_after_join_check" CHECK (left_on IS NULL OR left_on >= join_date);

ALTER TABLE "staff" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "class_teacher_assignments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "teaching_assignments" ENABLE ROW LEVEL SECURITY;
