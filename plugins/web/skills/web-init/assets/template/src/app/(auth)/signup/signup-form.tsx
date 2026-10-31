"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { signupSchema, type SignupInput } from "@/lib/validations/auth";
import { signup } from "../actions";

export function SignupForm() {
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  const onSubmit = (values: SignupInput) =>
    startTransition(async () => {
      const result = await signup(values);
      if (result.error) return void toast.error(result.error);
      toast.success(result.message);
      reset();
    });

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate>
      <FieldGroup>
        <Field data-invalid={!!errors.email}>
          <FieldLabel htmlFor="email">이메일</FieldLabel>
          <Input id="email" type="email" autoComplete="email" aria-invalid={!!errors.email} {...register("email")} />
          <FieldError errors={[errors.email]} />
        </Field>
        <Field data-invalid={!!errors.password}>
          <FieldLabel htmlFor="password">비밀번호</FieldLabel>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.password}
            {...register("password")}
          />
          <FieldError errors={[errors.password]} />
        </Field>
        <Field data-invalid={!!errors.confirmPassword}>
          <FieldLabel htmlFor="confirmPassword">비밀번호 확인</FieldLabel>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            aria-invalid={!!errors.confirmPassword}
            {...register("confirmPassword")}
          />
          <FieldError errors={[errors.confirmPassword]} />
        </Field>
        <Button type="submit" disabled={pending}>
          {pending ? "가입 중..." : "회원가입"}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          이미 계정이 있나요? <Link href="/login" className="underline">로그인</Link>
        </p>
      </FieldGroup>
    </form>
  );
}
