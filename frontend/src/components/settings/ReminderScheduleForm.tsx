import {
  Alert,
  AlertDescription,
  AlertIcon,
  Button,
  FormControl,
  FormErrorMessage,
  FormHelperText,
  FormLabel,
  HStack,
  Input,
  InputGroup,
  InputRightAddon,
  Stack,
  Tag,
  TagCloseButton,
  TagLabel,
  Text,
  Wrap,
  WrapItem,
} from '@chakra-ui/react';
import { useState, type KeyboardEvent } from 'react';
import { useFormContext } from 'react-hook-form';
import {
  type BusinessProfileFormValues,
  MAX_REMINDER_DAYS,
  REMINDER_DAY_MAX,
  REMINDER_DAY_MIN,
} from './businessProfileSchema';

/**
 * Reminder schedule: days after the due date on which a reminder is sent.
 * Must be rendered inside a `FormProvider` of `BusinessProfileFormValues`.
 */
export function ReminderScheduleForm() {
  const {
    watch,
    setValue,
    formState: { errors },
  } = useFormContext<BusinessProfileFormValues>();
  const days = watch('reminderDaysAfterDue');
  const [draft, setDraft] = useState<string>('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const isFull = days.length >= MAX_REMINDER_DAYS;

  const updateDays = (next: number[]): void => {
    setValue(
      'reminderDaysAfterDue',
      [...next].sort((a, b) => a - b),
      { shouldDirty: true, shouldValidate: true },
    );
  };

  const addDay = (): void => {
    const trimmed = draft.trim();
    if (!/^\d+$/.test(trimmed)) {
      setDraftError('Enter a whole number of days');
      return;
    }
    const day = Number(trimmed);
    if (day < REMINDER_DAY_MIN || day > REMINDER_DAY_MAX) {
      setDraftError(`Choose a day between ${REMINDER_DAY_MIN} and ${REMINDER_DAY_MAX}`);
      return;
    }
    if (days.includes(day)) {
      setDraftError(`Day ${day} is already in the schedule`);
      return;
    }
    if (isFull) {
      setDraftError(`At most ${MAX_REMINDER_DAYS} reminders`);
      return;
    }
    updateDays([...days, day]);
    setDraft('');
    setDraftError(null);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    // Enter adds the day instead of submitting the surrounding settings form.
    if (event.key === 'Enter') {
      event.preventDefault();
      addDay();
    }
  };

  const listError = errors.reminderDaysAfterDue?.message;

  return (
    <Stack spacing={5}>
      <Alert status="info" borderRadius="md">
        <AlertIcon />
        <AlertDescription>
          Automatic reminder emails arrive after the MVP. Your schedule is saved now and will be
          used as soon as reminders are switched on.
        </AlertDescription>
      </Alert>

      <Stack spacing={2}>
        <Text fontWeight="medium">Send a reminder this many days after the due date</Text>
        {days.length === 0 ? (
          <Text color="text-muted" fontSize="sm">
            No reminders scheduled.
          </Text>
        ) : (
          <Wrap spacing={2} aria-label="Reminder days" role="list">
            {days.map((day) => (
              <WrapItem key={day} role="listitem">
                <Tag size="lg" borderRadius="full" variant="subtle" colorScheme="purple">
                  <TagLabel>
                    {day} {day === 1 ? 'day' : 'days'}
                  </TagLabel>
                  <TagCloseButton
                    aria-label={`Remove ${day} day reminder`}
                    onClick={() => updateDays(days.filter((d) => d !== day))}
                  />
                </Tag>
              </WrapItem>
            ))}
          </Wrap>
        )}
        {listError && (
          <Text color="red.500" fontSize="sm" role="alert">
            {listError}
          </Text>
        )}
      </Stack>

      <FormControl isInvalid={Boolean(draftError)}>
        <FormLabel htmlFor="reminderDayDraft">Add a reminder day</FormLabel>
        <HStack align="flex-start" maxW="sm">
          <InputGroup>
            <Input
              id="reminderDayDraft"
              type="number"
              inputMode="numeric"
              min={REMINDER_DAY_MIN}
              max={REMINDER_DAY_MAX}
              value={draft}
              isDisabled={isFull}
              onChange={(e) => {
                setDraft(e.target.value);
                setDraftError(null);
              }}
              onKeyDown={handleKeyDown}
            />
            <InputRightAddon>days</InputRightAddon>
          </InputGroup>
          <Button onClick={addDay} isDisabled={isFull || draft.trim() === ''} variant="outline">
            Add
          </Button>
        </HStack>
        {draftError ? (
          <FormErrorMessage>{draftError}</FormErrorMessage>
        ) : (
          <FormHelperText>
            {isFull
              ? `Maximum of ${MAX_REMINDER_DAYS} reminders reached.`
              : `${days.length} of ${MAX_REMINDER_DAYS} reminders used.`}
          </FormHelperText>
        )}
      </FormControl>
    </Stack>
  );
}

export default ReminderScheduleForm;
