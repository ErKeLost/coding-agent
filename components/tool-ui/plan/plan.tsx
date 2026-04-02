"use client";

import * as React from "react";
import { useMemo, useState } from "react";
import {
  Loader2,
  Check,
  X,
  MoreHorizontal,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import type { PlanProps, PlanTodo, PlanTodoStatus } from "./schema";
import {
  cn,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "./_adapter";
import { ActionButtons, normalizeActionsConfig } from "../shared";

const INITIAL_VISIBLE_TODO_COUNT = 4;

function TodoIcon({ status }: { status: PlanTodoStatus }) {
  if (status === "pending") {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border bg-card motion-safe:transition-all motion-safe:duration-200"
        aria-hidden="true"
      />
    );
  }

  if (status === "in_progress") {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-[0_0_0_3px_hsl(var(--primary)/0.08)] motion-safe:transition-all motion-safe:duration-300"
        aria-hidden="true"
      >
        <Loader2 className="size-3 text-primary motion-safe:animate-[spin_0.7s_linear_infinite]" />
      </span>
    );
  }

  if (status === "completed") {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full border border-primary bg-primary shadow-sm motion-safe:animate-[spring-bounce_500ms_cubic-bezier(0.34,1.56,0.64,1)]"
        aria-hidden="true"
      >
        <Check
          className="size-3 text-primary-foreground [&_path]:motion-safe:animate-[check-draw_400ms_cubic-bezier(0.34,1.56,0.64,1)_100ms_backwards]"
          strokeWidth={3}
          style={{ ["--check-path-length" as string]: "24" }}
        />
      </span>
    );
  }

  if (status === "cancelled") {
    return (
      <span
        className="flex size-4 shrink-0 items-center justify-center rounded-full border border-destructive bg-destructive shadow-sm motion-safe:animate-[spring-bounce_500ms_cubic-bezier(0.34,1.56,0.64,1)] dark:border-red-600 dark:bg-red-600"
        aria-hidden="true"
      >
        <X
          className="size-3 text-white [&_path]:motion-safe:animate-[check-draw_400ms_cubic-bezier(0.34,1.56,0.64,1)_100ms_backwards]"
          strokeWidth={3}
          style={{ ["--check-path-length" as string]: "16" }}
        />
      </span>
    );
  }

  return null;
}

interface PlanTodoItemProps {
  todo: PlanTodo;
  className?: string;
  style?: React.CSSProperties;
  showConnector?: boolean;
}

function PlanTodoItem({ todo, className, style, showConnector }: PlanTodoItemProps) {
  const [isOpen, setIsOpen] = React.useState(false);

  const labelElement = (
    <span
      className={cn(
        "text-xs font-medium leading-5 break-words",
        "text-[11px] leading-4.5",
        todo.status === "pending" && "text-muted-foreground",
        todo.status === "in_progress" && "motion-safe:shimmer shimmer-invert text-foreground",
        (todo.status === "completed" || todo.status === "cancelled") && "text-muted-foreground"
      )}
    >
      {todo.label}
    </span>
  );

  if (!todo.description) {
    return (
      <li className={cn("relative -mx-1 flex cursor-default items-start gap-2.5 rounded-md px-1 py-1", className)} style={style}>
        {showConnector && (
          <div
            className="absolute left-3.5 top-4 w-px bg-border"
            style={{
              height: "calc(100% + 0.25rem)",
            }}
            aria-hidden="true"
          />
        )}
        <div className="relative z-10">
          <TodoIcon status={todo.status} />
        </div>
        <div className="flex-1 min-w-0">
          {labelElement}
        </div>
      </li>
    );
  }

  return (
    <li className={cn("relative -mx-1 cursor-default rounded-md min-w-0", className)} style={style}>
      {showConnector && (
        <div
          className="absolute left-3.5 top-4 w-px bg-border"
          style={{
            height: "calc(100% + 0.25rem)",
          }}
          aria-hidden="true"
        />
      )}
      <Collapsible asChild open={isOpen} onOpenChange={setIsOpen}>
        <div
          className="min-w-0 rounded-md motion-safe:transition-all motion-safe:duration-200 data-[state=open]:bg-primary/5"
          style={{
            backdropFilter: isOpen ? "blur(2px)" : undefined,
          }}
        >
        <CollapsibleTrigger className="group/todo flex w-full cursor-default items-start gap-2 px-1 py-1 text-left">
          <div className="relative z-10">
            <TodoIcon status={todo.status} />
          </div>
          <span className="flex-1 min-w-0">
            {labelElement}
          </span>
          <ChevronRight className="mt-0.5 size-3 shrink-0 rotate-90 text-muted-foreground/50 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover/todo:text-muted-foreground group-data-[state=open]/todo:[transform:rotateY(180deg)]" />
        </CollapsibleTrigger>
        <CollapsibleContent className="group/content" data-slot="collapsible-content">
          <div className="min-w-0 motion-safe:group-data-[state=open]/content:animate-[fade-in-stagger_120ms_ease-out_30ms_backwards] motion-safe:group-data-[state=closed]/content:animate-[fade-out-stagger_120ms_ease-out]">
            <p className="text-muted-foreground min-w-0 break-words pr-2 pb-1 pl-6.5 text-[10px] text-pretty">
              {todo.description}
            </p>
          </div>
        </CollapsibleContent>
        </div>
      </Collapsible>
    </li>
  );
}

interface TodoListProps {
  todos: PlanTodo[];
}

function TodoList({ todos }: TodoListProps) {
  return (
    <>
      {todos.map((todo, index) => {
        return (
          <PlanTodoItem
            key={todo.id}
            todo={todo}
            showConnector={index < todos.length - 1}
          />
        );
      })}
    </>
  );
}

interface ProgressBarProps {
  progress: number;
}

function ProgressBar({ progress }: ProgressBarProps) {
  return (
    <div className="relative mb-2 h-1.5 overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          progress === 100
            ? "bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-400 motion-safe:animate-[progress-pulse_600ms_ease-out]"
            : "bg-primary"
        )}
        style={{
          width: `${progress}%`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 1px 2px rgba(0,0,0,0.2)",
        }}
      />
    </div>
  );
}

export function Plan({
  id,
  title,
  description,
  todos,
  maxVisibleTodos = INITIAL_VISIBLE_TODO_COUNT,
  showProgress = true,
  responseActions,
  onResponseAction,
  onBeforeResponseAction,
  className,
}: PlanProps) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  const {
    visibleTodos,
    hiddenTodos,
    completedCount,
    allComplete,
    progress,
    currentTodo,
  } =
    useMemo(() => {
      const completed = todos.filter((t) => t.status === "completed").length;
      return {
        visibleTodos: todos.slice(0, maxVisibleTodos),
        hiddenTodos: todos.slice(maxVisibleTodos),
        completedCount: completed,
        allComplete: completed === todos.length,
        progress: (completed / todos.length) * 100,
        currentTodo:
          todos.find((todo) => todo.status === "in_progress") ??
          todos.find((todo) => todo.status === "pending") ??
          todos[0],
      };
    }, [todos, maxVisibleTodos]);

  const resolvedFooterActions = useMemo(
    () => normalizeActionsConfig(responseActions),
    [responseActions],
  );

  return (
    <Card
      className={cn("w-full min-w-0 max-w-none gap-1 py-1 text-xs", className)}
      data-tool-ui-id={id}
      data-slot="plan"
    >
        <CardHeader className="px-3.5 pt-3 pb-1">
          <button
            type="button"
            onClick={() => setIsCollapsed((value) => !value)}
            className="flex w-full items-center justify-between gap-3 rounded-xl px-0 py-0 text-left transition-colors hover:bg-transparent"
            aria-expanded={!isCollapsed}
          >
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <CardTitle className="truncate text-[11px] font-medium leading-4.5">
                  {title}
                </CardTitle>
                {allComplete ? (
                  <Check className="size-3 shrink-0 text-emerald-500" />
                ) : null}
              </div>
              <CardDescription className="mt-0.5 text-[10px] leading-4.5 text-muted-foreground/80">
                {completedCount}/{todos.length} complete
                {currentTodo ? ` · ${currentTodo.label}` : ""}
              </CardDescription>
            </div>
            <ChevronDown
              className={cn(
                "size-3.5 shrink-0 text-muted-foreground transition-transform",
                !isCollapsed && "rotate-180"
              )}
            />
          </button>
        </CardHeader>

        {!isCollapsed ? (
        <CardContent className="min-w-0 px-3.5 pt-1 pb-3">
          <div className="min-w-0 rounded-2xl bg-muted/28 px-3 py-2.5">
            {showProgress && (
              <>
                <div className="text-muted-foreground mb-1 text-[10px]">
                  {completedCount} of {todos.length} complete
                </div>

                <ProgressBar progress={progress} />
              </>
            )}

            {description ? (
              <p className="mb-1.5 text-[10px] text-muted-foreground">{description}</p>
            ) : null}

            <ul className="mt-1.5 min-w-0 space-y-0">
              <TodoList todos={visibleTodos} />

              {hiddenTodos.length > 0 && (
                <li className="mt-0.5">
                  <Accordion type="single" collapsible>
                    <AccordionItem value="more" className="border-0">
                      <AccordionTrigger className="text-muted-foreground hover:text-primary flex cursor-default items-start justify-start gap-1.5 py-0.5 text-[11px] font-normal [&>svg:last-child]:hidden">
                        <MoreHorizontal className="mt-0.5 size-3 shrink-0 text-muted-foreground/70" />
                        <span>{hiddenTodos.length} more</span>
                      </AccordionTrigger>
                      <AccordionContent className="pt-1 pb-0">
                        <ul className="-mx-1 space-y-1.5 px-1">
                          <TodoList todos={hiddenTodos} />
                        </ul>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </li>
              )}
            </ul>
          </div>
        </CardContent>
        ) : null}

        {resolvedFooterActions && (
          <CardFooter className="@container/actions">
            <ActionButtons
              actions={resolvedFooterActions.items}
              align={resolvedFooterActions.align}
              confirmTimeout={resolvedFooterActions.confirmTimeout}
              onAction={(id) => onResponseAction?.(id)}
              onBeforeAction={onBeforeResponseAction}
              className="w-full"
            />
          </CardFooter>
        )}
    </Card>
  );
}
