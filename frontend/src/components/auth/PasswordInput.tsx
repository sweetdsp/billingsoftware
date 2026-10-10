import { Button, Input, InputGroup, InputRightElement, type InputProps } from '@chakra-ui/react';
import { forwardRef, useState } from 'react';

export type PasswordInputProps = Omit<InputProps, 'type'>;

/** Password field with a show/hide toggle. Forwards its ref so react-hook-form `register` works. */
export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput(props, ref) {
    const [isVisible, setIsVisible] = useState<boolean>(false);

    return (
      <InputGroup>
        <Input ref={ref} type={isVisible ? 'text' : 'password'} pr="4.5rem" {...props} />
        <InputRightElement w="4.5rem">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setIsVisible((value) => !value)}
            aria-label={isVisible ? 'Hide password' : 'Show password'}
          >
            {isVisible ? 'Hide' : 'Show'}
          </Button>
        </InputRightElement>
      </InputGroup>
    );
  },
);

export default PasswordInput;
